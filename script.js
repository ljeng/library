const [BOOKS, GRAPH, COLORS] = await Promise.all([
  fetch('data/duplicate-frequent.json').then(response => response.json()),
  fetch('data/graph.json').then(response => response.json()),
  fetch('data/colors.json').then(response => response.json())
]);

const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const legend = document.getElementById('legend');
const tooltip = document.getElementById('tooltip');
const author = tooltip.querySelector('.author');
const title = tooltip.querySelector('.title');
const english = tooltip.querySelector('.english');
const nodes = [];
for (const [i, book] of BOOKS.entries()) {
  const last = [].concat(book.author || []);
  const first = [].concat(book['author-forename'] || []);
  const author = [];
  for (let k = 0; k < last.length; author.push(last[k++])) 
    if (first[k])
      last[k] = `${first[k]} ${last[k]}`;
  nodes.push({
    i,
    class: book.classification,
    author: author.join(', '),
    title: book.title,
    english: book.english || null,
    count: book.count
  });
}
const parentChild = new Map();
const count = {};
for (const node of nodes) {
  parentChild.set(node.i, node.i);
  count[node.class] = (count[node.class] || 0) + 1;
}

function unionFind(x) {
  let root = x;
  while (parentChild.get(root) !== root) root = parentChild.get(root);
  while (parentChild.get(x) !== root) {
    const child = parentChild.get(x);
    parentChild.set(x, root);
    x = child;
  }
  return root;
}

const graph = [];
for (let source = 0; source < GRAPH.length; source++)
  for (const [target, weight] of GRAPH[source])
    graph.push([source, target, weight]);
graph.sort((a, b) => b[2] - a[2]);
const edges = [];
for (const [i, [source, target, weight]] of graph.entries()) {
  const rootSource = unionFind(source), rootTarget = unionFind(target);
  if (i < nodes.length || rootSource !== rootTarget) {
    parentChild.set(rootSource, rootTarget);
    edges.push({source, target, weight: 1 - weight});
  }
}
for (const cl of Object.keys(COLORS)) if (count[cl])
  legend.insertAdjacentHTML('beforeend',
    `<button class="lg" type="button" data-c="${cl}"`
    + ' aria-pressed="false">'
    + `<span class="sw" style="background:${COLORS[cl]}"></span>`
    + `<span>${cl}</span><span class="ct">${count[cl]}</span></button>`);
let c = null;
legend.addEventListener('click', event => {
  const closest = event.target.closest('.lg');
  if (closest) {
    c = c === closest.dataset.c ? null : closest.dataset.c;
    for (const query of legend.querySelectorAll('.lg')) {
      query.setAttribute('aria-pressed', String(query.dataset.c === c));
      query.classList.toggle('dim', c !== null && c !== query.dataset.c);
    }
    requestDraw();
  }
});
const style = getComputedStyle(canvas).color;
let width, height;
let isMove = false;
let requestId = 0;
let transform = d3.zoomIdentity;
let hover = null;
let dragSubject = null;

function resize() {
  const boundingClientRect = canvas.getBoundingClientRect();
  width = boundingClientRect.width, height = boundingClientRect.height;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  if (!isMove)
    d3.select(canvas)
      .call(zoom.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(0.19));
  requestDraw();
}

function requestDraw() {
  if (requestId) return;
  requestId = requestAnimationFrame(function () {
    requestId = 0;
    if (width) {
      context.save();
      context.clearRect(0, 0, width, height);
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);
      context.lineWidth = Math.max(0.35, 0.85 / transform.k);
      context.strokeStyle = style;
      context.globalAlpha = c === null ? 0.42 : 0.16;
      context.beginPath();
      for (const edge of edges) {
        context.moveTo(edge.source.x, edge.source.y);
        context.lineTo(edge.target.x, edge.target.y);
      }
      context.stroke();
      for (const node of nodes) {
        context.globalAlpha = c === null || node.class === c ? 1 : 0.13;
        context.fillStyle = COLORS[node.class];
        context.beginPath();
        let grown = 1;
        if (node === dragSubject) grown = 1.22;
        else if (node === hover) grown = 1.1;
        context.arc(node.x,
          node.y,
          10 * Math.sqrt(node.count) * grown,
          0,
          6.2832);
        context.fill();
      }
      context.globalAlpha = 1;
      context.restore();
    }
  });
}

const forceSimulation = d3.forceSimulation(nodes)
  .force(
    'link',
    d3.forceLink(edges)
      .id(d => d.i)
      .strength(0.75)
      .distance(l => 10 * (Math.sqrt(l.source.count)
        + Math.sqrt(l.target.count))
        + l.weight * 32
        + 18)
  )
  .force(
    'charge',
    d3.forceManyBody()
      .distanceMax(900)
      .strength(d => -90 - 50 * Math.sqrt(d.count))
  )
  .alpha(1)
  .alphaDecay(0.0165)
  .velocityDecay(0.32)
  .on('tick', requestDraw);
forceSimulation.stop();
for (let i = 0; i < 600; i++) forceSimulation.tick();
forceSimulation.alpha(0.35).alphaDecay(0.02).restart();

function hit(screenX, screenY) {
  const k = transform.k;
  const [x, y] = transform.invert([screenX, screenY]);
  const node = forceSimulation.find(x, y, 60 / k);
  if (!node) return;
  const reach = 10 * Math.sqrt(node.count) + 6 / k;
  if (Math.hypot(node.x - x, node.y - y) < reach) return node;
}

canvas.addEventListener('mousemove', event => {
  const boundingClientRect = canvas.getBoundingClientRect();
  const x = event.clientX - boundingClientRect.left;
  const y = event.clientY - boundingClientRect.top;
  const node = hit(x, y);
  if (node !== hover) {
    hover = node;
    requestDraw();
  }
  if (node) {
    title.textContent = node.title, author.textContent = node.author;
    english.textContent = node.english || '';
    english.hidden = !node.english;
    tooltip.hidden = false;
    tooltip.style.left = Math.min(event.clientX + 15, innerWidth - 300) + 'px';
    tooltip.style.top = event.clientY + 15 + 'px';
  } else tooltip.hidden = true;
});

canvas.addEventListener('mouseleave', () => {
  hover = null;
  tooltip.hidden = true;
  requestDraw();
});
const zoom = d3.zoom()
  .scaleExtent([0.18, 9])
  .on('start', event => event.sourceEvent && (isMove = true))
  .on('zoom', event => (transform = event.transform, requestDraw()));
let source = null;
let grabX = 0, grabY = 0;
const drag = d3.drag()
  .container(canvas)
  .subject(event => hit(event.x, event.y))
  .on('start',
    event => (dragSubject = null,
      source = d3.pointer(event.sourceEvent, canvas)))
  .on('drag', event => {
    const pointer = d3.pointer(event.sourceEvent, canvas);
    const [xInvert, yInvert] = transform.invert(pointer);
    if (!dragSubject
      && Math.hypot(pointer[0] - source[0], pointer[1] - source[1]) > 3) {
      isMove = true;
      dragSubject = event.subject;
      grabX = event.subject.x - xInvert, grabY = event.subject.y - yInvert;
      forceSimulation.alphaTarget(0.3).restart();
    }
    if (dragSubject)
      event.subject.fx = xInvert + grabX, event.subject.fy = yInvert + grabY;
  })
  .on('end', event => {
    if (dragSubject) {
      forceSimulation.alphaTarget(0);
      dragSubject = null;
      event.subject.fx = event.subject.fy = null;
      requestDraw();
    }
  });

d3.select(canvas).call(drag).call(zoom);
forceSimulation.on('end', requestDraw);
new ResizeObserver(resize).observe(canvas.parentNode);
resize();
