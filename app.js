// app.js — DAVIS Dashboard
// AI-Augmented Dashboard with IYH App Integration and Reactive Filters

// ── Helper: parse angka (koma sebagai desimal) ────────────────
function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).trim().replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── Helper: parse tanggal YYYY-MM-DD atau DD/MM/YYYY ─────────────────────────
function parseDate(str) {
  if (!str) return null;
  const clean = str.trim().split(' ')[0]; // Hilangkan bagian jam jika ada

  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateISO(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Variabel global ───────────────────────────────────────────
let rawData = [];
let filteredData = [];
let summaryStats = {};
let currentAnomalies = {};
let _aiDebounceTimer = null;

// Tooltip global D3
const tooltip = d3.select('body').append('div')
  .attr('class', 'd3-tooltip');

// ── Entry point ───────────────────────────────────────────────
d3.json('Sales_BY_Category_202606040914-1.json').then(async function (data) {

  // == FASE 1: MAPPING DATA ==
  rawData = data.map(d => ({
    orderId: d['SalesOrderID'],
    category: d['Category'],
    subcat: d['SubCategory'],
    region: d['Territory'],
    country: d['CountryRegion'],
    segment: d['Segment'],
    sales: parseNum(d['Sales']),
    profit: parseNum(d['Profit']),
    quantity: parseNum(d['Qty']),
    orderDate: parseDate(d['OrderDate']),
    productName: d['ProductName']
  })).filter(d => !isNaN(d.sales) && !isNaN(d.profit) && d.orderDate !== null);

  // Inisialisasi default filter
  initFilters(rawData);

  // Jalankan filtering pertama kali
  applyFilters(true);

  // == FASE 3: AI NARASI — dipicu pertama kali ==
  const filterCtx = getActiveFilterContext();
  regenerateAINarrative(summaryStats, currentAnomalies, filterCtx);

});

// ── fillZone: isi elemen teks dengan animasi ──────────────────
function fillZone(id, text) {
  const el = document.getElementById(id);
  if (!el || !text) return;
  el.textContent = text;
  el.classList.add('ai-loaded');
}

// ── getActiveFilterContext: baca semua filter aktif sebagai konteks AI ─
function getActiveFilterContext() {
  const startVal = document.getElementById('filter-date-start')?.value || '';
  const endVal   = document.getElementById('filter-date-end')?.value || '';
  const catVal   = document.getElementById('filter-category')?.value || 'All';
  const subVal   = document.getElementById('filter-subcategory')?.value || 'All';
  const segVal   = document.getElementById('filter-segment')?.value || 'All';
  const terVal   = document.getElementById('filter-territory')?.value || 'All';

  const parts = [];
  if (startVal && endVal) parts.push(`Periode: ${startVal} s.d. ${endVal}`);
  if (catVal !== 'All')   parts.push(`Kategori: ${catVal}`);
  if (subVal !== 'All')   parts.push(`Sub-Kategori: ${subVal}`);
  if (segVal !== 'All')   parts.push(`Segmen: ${segVal}`);
  if (terVal !== 'All')   parts.push(`Wilayah: ${terVal}`);

  if (parts.length === 0) return 'Semua data (tanpa filter khusus)';
  return parts.join(', ');
}

// ── regenerateAINarrative: re-generate judul + SCR + loading state ─
function regenerateAINarrative(stats, anomalies, filterContext) {
  // Set loading state
  const titleEl = document.getElementById('narrative-title');
  if (titleEl) { titleEl.textContent = '⏳ AI sedang menganalisis data...'; titleEl.classList.remove('loaded'); }
  fillZone('setup-text', '⏳ Menyusun narasi...');
  fillZone('conflict-text', '⏳ Menyusun narasi...');
  fillZone('resolution-text', '⏳ Menyusun narasi...');

  // Update filter badge
  const badgeEl = document.getElementById('active-filter-badge');
  const badgeText = document.getElementById('filter-badge-text');
  if (badgeEl && badgeText) {
    badgeText.textContent = filterContext;
    badgeEl.style.display = 'inline-flex';
  }

  Promise.allSettled([
    generateTitle(stats, anomalies, filterContext),
    generateStory(stats, anomalies, filterContext)
  ]).then(([titleResult, storyResult]) => {
    if (titleResult.status === 'fulfilled') {
      if (titleEl) {
        titleEl.textContent = titleResult.value.trim();
        titleEl.classList.add('loaded');
      }
    } else {
      if (titleEl) titleEl.textContent = 'Gagal memuat judul AI';
    }

    if (storyResult.status === 'fulfilled') {
      const scr = parseStoryResponse(storyResult.value);
      fillZone('setup-text', scr.setup);
      fillZone('conflict-text', scr.conflict);
      fillZone('resolution-text', scr.resolution);
    } else {
      fillZone('setup-text', 'Gagal memuat narasi AI.');
      fillZone('conflict-text', '');
      fillZone('resolution-text', '');
    }
  });
}

// ── Inisialisasi Filter UI ────────────────────────────────────
function initFilters(data) {
  // Set date inputs
  const dateExtent = d3.extent(data, d => d.orderDate);
  if (dateExtent[0]) {
    document.getElementById('filter-date-start').value = formatDateISO(dateExtent[0]);
    document.getElementById('filter-date-end').value = formatDateISO(dateExtent[1]);
  }

  // Populate Categories
  const categories = ['All', ...[...new Set(data.map(d => d.category))].sort()];
  const catSel = document.getElementById('filter-category');
  catSel.innerHTML = categories.map(c => `<option value="${c}">${c === 'All' ? 'Semua Kategori' : c}</option>`).join('');

  // Populate Segments
  const segments = ['All', ...[...new Set(data.map(d => d.segment))].sort()];
  const segSel = document.getElementById('filter-segment');
  segSel.innerHTML = segments.map(s => `<option value="${s}">${s === 'All' ? 'Semua Segmen' : s}</option>`).join('');

  // Populate Territories
  const territories = ['All', ...[...new Set(data.map(d => d.region))].sort()];
  const terSel = document.getElementById('filter-territory');
  terSel.innerHTML = territories.map(t => `<option value="${t}">${t === 'All' ? 'Semua Wilayah' : t}</option>`).join('');

  // Update sub-category dropdown
  updateSubcatDropdown(data);
}

// ── Update Sub-kategori Dropdown ──────────────────────────────
function updateSubcatDropdown(data) {
  const selectedCat = document.getElementById('filter-category').value;
  let subcats = [];

  if (selectedCat === 'All') {
    subcats = [...new Set(data.map(d => d.subcat))];
  } else {
    subcats = [...new Set(data.filter(d => d.category === selectedCat).map(d => d.subcat))];
  }
  subcats.sort();

  const subSel = document.getElementById('filter-subcategory');
  subSel.innerHTML = ['All', ...subcats].map(s => `<option value="${s}">${s === 'All' ? 'Semua Sub-Kategori' : s}</option>`).join('');
}

// ── Event handler kategori berubah ──────────────────────────
function onCategoryChange() {
  updateSubcatDropdown(rawData);
  applyFilters();
}

// ── Quick Year filter ─────────────────────────────────────────
function setQuickYear(year) {
  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().includes(year) || (year === 'All' && btn.textContent.trim().includes('Semua')));
  });

  if (year === 'All') {
    const dateExtent = d3.extent(rawData, d => d.orderDate);
    if (dateExtent[0]) {
      document.getElementById('filter-date-start').value = formatDateISO(dateExtent[0]);
      document.getElementById('filter-date-end').value = formatDateISO(dateExtent[1]);
    }
  } else {
    document.getElementById('filter-date-start').value = `${year}-01-01`;
    document.getElementById('filter-date-end').value = `${year}-12-31`;
  }
  applyFilters();
}

// ── Terapkan filter ──────────────────────────────────────────
function applyFilters(isFirstLoad = false) {
  const startVal = document.getElementById('filter-date-start').value;
  const endVal = document.getElementById('filter-date-end').value;
  const catVal = document.getElementById('filter-category').value;
  const subVal = document.getElementById('filter-subcategory').value;
  const segVal = document.getElementById('filter-segment').value;
  const terVal = document.getElementById('filter-territory').value;

  const startDate = startVal ? new Date(startVal) : null;
  const endDate = endVal ? new Date(endVal) : null;

  filteredData = rawData.filter(d => {
    if (startDate && d.orderDate < startDate) return false;
    if (endDate && d.orderDate > endDate) return false;
    if (catVal !== 'All' && d.category !== catVal) return false;
    if (subVal !== 'All' && d.subcat !== subVal) return false;
    if (segVal !== 'All' && d.segment !== segVal) return false;
    if (terVal !== 'All' && d.region !== terVal) return false;
    return true;
  });

  // Hitung ulang statistik & anomali
  summaryStats = computeSummary(filteredData);
  currentAnomalies = detectAllAnomalies(filteredData);

  // Render KPIs & Visualizations
  displaySummaryCards(summaryStats);
  dispatchDataReady(summaryStats);

  // Redraw D3 charts
  renderTrendChart(filteredData);
  renderScatterPlot(filteredData);
  renderCategorySubcatChart(filteredData);
  renderTerritoryProfitChart(filteredData);
  renderTopProductsChart(filteredData);

  // Update Anomaly Panel
  const sevCount = countSeverity(currentAnomalies);
  document.getElementById('badge-severe').textContent = sevCount.severe + ' Kritis';
  document.getElementById('badge-warning').textContent = sevCount.warning + ' Peringatan';
  renderRawAnomalies(currentAnomalies);

  if (!isFirstLoad) {
    // Debounce: tunggu 600ms setelah interaksi filter terakhir
    clearTimeout(_aiDebounceTimer);
    _aiDebounceTimer = setTimeout(() => {
      const filterCtx = getActiveFilterContext();
      regenerateAINarrative(summaryStats, currentAnomalies, filterCtx);
    }, 600);
  }
}

// ── computeSummary ────────────────────────────────────────────
function computeSummary(data) {
  const totalSales = d3.sum(data, d => d.sales);
  const totalProfit = d3.sum(data, d => d.profit);
  const margin = totalSales > 0 ? (totalProfit / totalSales * 100).toFixed(1) : '0.0';
  const totalOrders = new Set(data.map(d => d.orderId)).size;
  const totalQty = d3.sum(data, d => d.quantity);

  const byCategory = d3.rollup(
    data,
    v => ({ sales: d3.sum(v, d => d.sales), profit: d3.sum(v, d => d.profit) }),
    d => d.category
  );

  const catArray = [...byCategory.entries()].map(([cat, v]) => ({
    category: cat,
    sales: v.sales,
    profit: v.profit,
    margin: v.sales > 0 ? (v.profit / v.sales * 100).toFixed(1) : '0.0'
  }));
  catArray.sort((a, b) => b.margin - a.margin);

  const byRegion = d3.rollup(data, v => d3.sum(v, d => d.sales), d => d.region);
  const regionArray = [...byRegion.entries()]
    .map(([r, s]) => ({ region: r, sales: s }))
    .sort((a, b) => b.sales - a.sales);

  return {
    totalSales: totalSales.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    overallMargin: margin,
    totalOrders: totalOrders,
    totalQty: totalQty,
    categories: catArray,
    regions: regionArray,
    bestCategory: catArray[0] || { category: 'N/A', margin: '0' },
    worstCategory: catArray[catArray.length - 1] || { category: 'N/A', margin: '0' }
  };
}

// ── displaySummaryCards ───────────────────────────────────────
function displaySummaryCards(stats) {
  const cards = [
    { label: 'Total Sales', value: `$${(stats.totalSales / 1000000).toFixed(2)}M` },
    { label: 'Total Profit', value: `$${(stats.totalProfit / 1000).toFixed(0)}K` },
    { label: 'Profit Margin', value: `${stats.overallMargin}%` },
    { label: 'Quantity Sold', value: stats.totalQty.toLocaleString() },
    { label: 'Total Orders', value: stats.totalOrders.toLocaleString() }
  ];

  const el = document.getElementById('summary-cards');
  if (el) el.innerHTML = cards.map(c => `
    <div class="summary-card">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value">${c.value}</div>
    </div>`).join('');
}

// ── D3 Chart: Trend Line Chart ────────────────────────────────
function renderTrendChart(data) {
  d3.select('#chart-trend').selectAll('*').remove();
  if (data.length === 0) return;

  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const width = document.getElementById('chart-trend').clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = d3.select('#chart-trend').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Group by month
  const monthlyData = d3.rollups(data,
    v => ({
      sales: d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => `${d.orderDate.getFullYear()}-${String(d.orderDate.getMonth() + 1).padStart(2, '0')}`
  ).map(([month, v]) => ({
    date: new Date(month + '-01'),
    sales: v.sales,
    profit: v.profit
  })).sort((a, b) => a.date - b.date);

  const x = d3.scaleTime()
    .domain(d3.extent(monthlyData, d => d.date))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([
      d3.min(monthlyData, d => Math.min(d.sales, d.profit)) - 5000,
      d3.max(monthlyData, d => Math.max(d.sales, d.profit)) + 5000
    ])
    .range([height, 0]);

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat('%b %y')));

  svg.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `$${(d / 1000).toFixed(0)}K`));

  // Sales line
  svg.append('path')
    .datum(monthlyData)
    .attr('fill', 'none')
    .attr('stroke', '#06d6a0')
    .attr('stroke-width', 2)
    .attr('d', d3.line()
      .x(d => x(d.date))
      .y(d => y(d.sales))
    );

  // Profit line
  svg.append('path')
    .datum(monthlyData)
    .attr('fill', 'none')
    .attr('stroke', '#22d3ee')
    .attr('stroke-width', 2)
    .attr('d', d3.line()
      .x(d => x(d.date))
      .y(d => y(d.profit))
    );

  // Add interactive dots & tooltips
  svg.selectAll('.dot-sales')
    .data(monthlyData)
    .enter().append('circle')
    .attr('cx', d => x(d.date))
    .attr('cy', d => y(d.sales))
    .attr('r', 4)
    .attr('fill', '#06d6a0')
    .on('mouseover', function (event, d) {
      tooltip.style('display', 'block')
        .html(`<strong>${d3.timeFormat('%B %Y')(d.date)}</strong><br/>Sales: $${d.sales.toLocaleString()}<br/>Profit: $${d.profit.toLocaleString()}`);
    })
    .on('mousemove', function (event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// ── D3 Chart: Scatter Plot ────────────────────────────────────
function renderScatterPlot(data) {
  d3.select('#chart-scatter').selectAll('*').remove();
  if (data.length === 0) return;

  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const width = document.getElementById('chart-scatter').clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = d3.select('#chart-scatter').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Group by Product Name
  const productData = d3.rollups(data,
    v => ({
      sales: d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit),
      category: v[0].category
    }),
    d => d.productName
  ).map(([name, v]) => ({ name, ...v }));

  const x = d3.scaleLinear()
    .domain([0, d3.max(productData, d => d.sales)]).range([0, width]);

  const y = d3.scaleLinear()
    .domain([d3.min(productData, d => d.profit), d3.max(productData, d => d.profit)]).range([height, 0]);

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `$${(d / 1000).toFixed(0)}K`));

  svg.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `$${(d / 1000).toFixed(0)}K`));

  // Zero line for profit
  svg.append('line')
    .attr('x1', 0).attr('x2', width)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#475569')
    .attr('stroke-dasharray', '3,3');

  const colorScale = d3.scaleOrdinal()
    .domain(['Bikes', 'Accessories', 'Clothing'])
    .range(['#22d3ee', '#06d6a0', '#a78bfa']);

  svg.selectAll('.dot')
    .data(productData)
    .enter().append('circle')
    .attr('cx', d => x(d.sales))
    .attr('cy', d => y(d.profit))
    .attr('r', 4.5)
    .attr('opacity', 0.75)
    .attr('fill', d => colorScale(d.category) || '#10b981')
    .on('mouseover', function (event, d) {
      tooltip.style('display', 'block')
        .html(`<strong>${d.name}</strong><br/>Category: ${d.category}<br/>Sales: $${d.sales.toLocaleString()}<br/>Profit: $${d.profit.toLocaleString()}<br/>Margin: ${(d.profit / d.sales * 100).toFixed(1)}%`);
    })
    .on('mousemove', function (event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// ── D3 Chart: Category / Subcategory Bar ──────────────────────
function renderCategorySubcatChart(data) {
  d3.select('#chart-category-sub').selectAll('*').remove();
  if (data.length === 0) return;

  const margin = { top: 20, right: 30, bottom: 40, left: 100 };
  const width = document.getElementById('chart-category-sub').clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = d3.select('#chart-category-sub').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Group by Category/SubCategory based on active filters
  const selectedCat = document.getElementById('filter-category').value;
  const key = selectedCat === 'All' ? d => d.category : d => d.subcat;

  const grouped = d3.rollups(data,
    v => d3.sum(v, d => d.sales),
    key
  ).map(([name, sales]) => ({ name, sales }))
    .sort((a, b) => b.sales - a.sales);

  const y = d3.scaleBand()
    .domain(grouped.map(d => d.name))
    .range([0, height])
    .padding(0.25);

  const x = d3.scaleLinear()
    .domain([0, d3.max(grouped, d => d.sales)])
    .range([0, width]);

  svg.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `$${(d / 1000).toFixed(0)}K`));

  svg.selectAll('.bar')
    .data(grouped)
    .enter().append('rect')
    .attr('x', 0)
    .attr('y', d => y(d.name))
    .attr('width', d => x(d.sales))
    .attr('height', y.bandwidth())
    .attr('fill', '#06d6a0')
    .attr('opacity', 0.85)
    .attr('rx', 3)
    .on('mouseover', function (event, d) {
      tooltip.style('display', 'block')
        .html(`<strong>${d.name}</strong><br/>Sales: $${d.sales.toLocaleString()}`);
    })
    .on('mousemove', function (event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// ── D3 Chart: Profitability by Territory/Region ────────────────
function renderTerritoryProfitChart(data) {
  d3.select('#chart-territory-profit').selectAll('*').remove();
  if (data.length === 0) return;

  const margin = { top: 20, right: 30, bottom: 40, left: 100 };
  const width = document.getElementById('chart-territory-profit').clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = d3.select('#chart-territory-profit').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const grouped = d3.rollups(data,
    v => ({
      sales: d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => d.region
  ).map(([name, v]) => ({
    name,
    margin: v.sales > 0 ? (v.profit / v.sales * 100) : 0,
    sales: v.sales,
    profit: v.profit
  })).sort((a, b) => b.margin - a.margin);

  const y = d3.scaleBand()
    .domain(grouped.map(d => d.name))
    .range([0, height])
    .padding(0.25);

  const x = d3.scaleLinear()
    .domain([
      Math.min(0, d3.min(grouped, d => d.margin) - 2),
      d3.max(grouped, d => d.margin) + 2
    ])
    .range([0, width]);

  svg.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  // Draw zero vertical line
  svg.append('line')
    .attr('x1', x(0)).attr('x2', x(0))
    .attr('y1', 0).attr('y2', height)
    .attr('stroke', '#475569')
    .attr('stroke-dasharray', '3,3');

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d.toFixed(0)}%`));

  svg.selectAll('.bar')
    .data(grouped)
    .enter().append('rect')
    .attr('x', d => d.margin >= 0 ? x(0) : x(d.margin))
    .attr('y', d => y(d.name))
    .attr('width', d => Math.abs(x(d.margin) - x(0)))
    .attr('height', y.bandwidth())
    .attr('fill', d => d.margin >= 0 ? '#10b981' : '#ef4444')
    .attr('opacity', 0.85)
    .attr('rx', 3)
    .on('mouseover', function (event, d) {
      tooltip.style('display', 'block')
        .html(`<strong>${d.name}</strong><br/>Margin: ${d.margin.toFixed(1)}%<br/>Sales: $${d.sales.toLocaleString()}<br/>Profit: $${d.profit.toLocaleString()}`);
    })
    .on('mousemove', function (event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// ── D3 Chart: Top 10 Products ─────────────────────────────────
function renderTopProductsChart(data) {
  d3.select('#chart-top-products').selectAll('*').remove();
  if (data.length === 0) return;

  const margin = { top: 20, right: 30, bottom: 40, left: 160 };
  const width = document.getElementById('chart-top-products').clientWidth - margin.left - margin.right;
  const height = 280 - margin.top - margin.bottom;

  const svg = d3.select('#chart-top-products').append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const topProds = d3.rollups(data,
    v => ({
      sales: d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => d.productName
  ).map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const y = d3.scaleBand()
    .domain(topProds.map(d => d.name.length > 25 ? d.name.substring(0, 22) + '...' : d.name))
    .range([0, height])
    .padding(0.25);

  const x = d3.scaleLinear()
    .domain([0, d3.max(topProds, d => d.profit)])
    .range([0, width]);

  svg.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => `$${(d / 1000).toFixed(0)}K`));

  svg.selectAll('.bar')
    .data(topProds)
    .enter().append('rect')
    .attr('x', 0)
    .attr('y', (d, i) => y(y.domain()[i]))
    .attr('width', d => x(d.profit))
    .attr('height', y.bandwidth())
    .attr('fill', '#22d3ee')
    .attr('opacity', 0.85)
    .attr('rx', 3)
    .on('mouseover', function (event, d) {
      tooltip.style('display', 'block')
        .html(`<strong>${d.name}</strong><br/>Profit: $${d.profit.toLocaleString()}<br/>Sales: $${d.sales.toLocaleString()}`);
    })
    .on('mousemove', function (event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
    })
    .on('mouseout', () => tooltip.style('display', 'none'));
}

// ── buildAnomalyMap ───────────────────────────────────────────
function buildAnomalyMap(anomalies) {
  const map = new Map();
  anomalies.profitOutliers.forEach(a => {
    map.set(a.name, { severity: a.severity, zScore: a.zScore, direction: a.direction });
  });
  return map;
}

// ── renderRawAnomalies ────────────────────────────────────────
function renderRawAnomalies(anomalies) {
  const container = document.getElementById('alert-tab-raw');
  if (!container) return;

  const items = [];

  anomalies.profitOutliers.forEach(a => {
    items.push({
      severity: a.severity,
      label: `Profit Margin Anomali: ${a.name}`,
      detail: `margin ${a.margin}%  |  Z-score ${a.zScore}  |  ${a.direction === 'low' ? 'jauh di bawah' : 'jauh di atas'} rata-rata`
    });
  });

  anomalies.momSpikes.forEach(a => {
    items.push({
      severity: a.severity,
      label: `Revenue ${a.direction === 'drop' ? 'Turun' : 'Naik'} Drastis: ${a.month}`,
      detail: `${a.changePct}% MoM  |  $${Number(a.current).toLocaleString()} vs $${Number(a.previous).toLocaleString()} bulan lalu`
    });
  });

  const iqrSubcats = anomalies.iqrOutliers?.bySubcat || [];
  iqrSubcats.forEach(a => {
    items.push({
      severity: a.severity,
      label: `Distribusi Tidak Normal: ${a.subcat}`,
      detail: `${a.count} transaksi outlier  |  rata-rata $${Number(a.avgSales).toLocaleString()}  |  nilai ${a.direction === 'high' ? 'sangat tinggi' : 'sangat rendah'}`
    });
  });

  if (items.length === 0) {
    container.innerHTML = '<p class="placeholder-text">Tidak ada anomali signifikan terdeteksi.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="alert-item">
      <div class="ai-dot ${item.severity}"></div>
      <div>
        <div class="ai-label">${item.label}</div>
        <div class="ai-detail">${item.detail}</div>
      </div>
    </div>`).join('');
}

// ── requestAlertNarration ─────────────────────────────────────
async function requestAlertNarration() {
  const btn = document.getElementById('btn-narrate');
  const output = document.getElementById('ai-narration-output');
  if (!btn || !output) return;

  btn.disabled = true;
  btn.textContent = 'Memproses...';
  switchAlertTab('ai', document.querySelector('.alert-tab:last-child'));

  output.innerHTML = `<p class="loading-text"><span class="spinner-inline"></span>Mengirim data anomali ke AI...</p>`;

  try {
    const narration = await narrateAllAlerts(currentAnomalies);
    output.innerHTML = narration
      .split('\n').filter(l => l.trim())
      .map(l => `<div class="narration-line">${l}</div>`)
      .join('');
  } catch (err) {
    output.innerHTML = `<p style="color:#ef4444">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Narasi AI';
  }
}

// ── switchAlertTab ────────────────────────────────────────────
function switchAlertTab(tab, btnEl) {
  document.querySelectorAll('.alert-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.alert-tab-content').forEach(c => c.style.display = 'none');
  if (btnEl) btnEl.classList.add('active');
  const target = document.getElementById('alert-tab-' + tab);
  if (target) target.style.display = 'block';
}

// ── requestInsight (Dynamic Q&A) ─────────────────────────────
async function requestInsight() {
  const btn = document.getElementById('btn-insight');
  const output = document.getElementById('insight-output');
  const question = document.getElementById('custom-question');
  if (!btn || !output) return;

  const qText = question ? question.value.trim() : '';
  if (!qText) return;

  btn.disabled = true;
  btn.textContent = 'Memproses...';
  output.innerHTML = `<div class="insight-loading"><div class="spinner"></div><span>Mengirim data ke AI...</span></div>`;

  try {
    const filterCtx = getActiveFilterContext();
    const result = await getInsight(summaryStats, qText, filterCtx);
    output.innerHTML = formatInsight(result);
  } catch (err) {
    output.innerHTML = `<div class="insight-error"><strong>Error:</strong> ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Minta Insight →';
  }
}

function quickAsk(q) {
  const el = document.getElementById('custom-question');
  if (el) el.value = q;
  requestInsight();
}

// ── formatInsight — bersihkan markdown, render rapi ──────────
function formatInsight(text) {
  let t = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,3}\s*/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/`(.+?)`/g, '$1');

  const lines = t.split('\n');
  let html = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { html += '<div class="insight-gap"></div>'; continue; }

    if (/^\d+\.\s/.test(line)) {
      const txt = line.replace(/^(\d+\.\s*)(insight\s*:\s*)?/i, '<b>$1</b> ');
      html += `<div class="insight-item">${txt}</div>`;
      continue;
    }

    if (/^[*\-]\s/.test(line)) {
      const txt = line.replace(/^[*\-]\s+/, '');
      html += `<div class="insight-bullet">&#x2022;&nbsp; ${txt}</div>`;
      continue;
    }

    html += `<div class="insight-line">${line}</div>`;
  }

  return html;
}

// ── Dispatch event setelah data siap ────────────────────────
function dispatchDataReady(stats) {
  window.dispatchEvent(new CustomEvent('capstone-data-ready', { detail: stats }));
}
