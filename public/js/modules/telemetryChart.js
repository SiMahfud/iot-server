// =============================================================
// Telemetry Canvas Chart Visualizer Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, escapeHtml, showToast } from '../state.js';

let chartPoints = [];
let chartUnit = '';

export function initTelemetryChart() {
  const btnClose = document.getElementById('btnCloseGraphModal');
  const modal = document.getElementById('modalTelemetryGraph');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
}

export function openTelemetryGraphModal(componentId, componentName, unit = '') {
  const modal = document.getElementById('modalTelemetryGraph');
  const title = document.getElementById('telemetryGraphTitle');
  const sub = document.getElementById('telemetryGraphSub');
  const loadingMsg = document.getElementById('graphLoadingMsg');

  if (!modal) return;

  chartUnit = unit;
  if (title) title.textContent = `Grafik: ${componentName || componentId}`;
  if (sub) sub.textContent = `Riwayat data telemetri (${unit || 'Nilai'})`;
  if (loadingMsg) loadingMsg.classList.remove('hidden');

  modal.classList.remove('hidden');

  const canvas = document.getElementById('telemetryCanvas');
  if (canvas) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }

  fetch(`/api/devices/${encodeURIComponent(state.activeDeviceId)}/components/${encodeURIComponent(componentId)}/history?limit=60`, {
    headers: { 'Authorization': `Bearer ${state.authToken}` }
  })
  .then(r => r.json())
  .then(res => {
    if (loadingMsg) loadingMsg.classList.add('hidden');
    if (res.success && Array.isArray(res.data)) {
      chartPoints = res.data;
      drawCanvasChart(canvas, chartPoints, unit);
    } else {
      showToast('Tidak ada data riwayat telemetri', false);
    }
  })
  .catch(err => {
    if (loadingMsg) loadingMsg.classList.add('hidden');
    showToast('Gagal memuat riwayat data', false);
  });
}

function drawCanvasChart(canvas, points, unit) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!points || points.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Belum ada data riwayat telemetri numerik tercatat', w / 2, h / 2);
    return;
  }

  const values = points.map(p => parseFloat(p.value)).filter(v => !isNaN(v));
  if (values.length === 0) return;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }

  const padding = 36;
  const graphW = w - padding * 2;
  const graphH = h - padding * 2;

  // Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(w - padding, y);
    ctx.stroke();

    const valLabel = (max - (max - min) * (i / 4)).toFixed(1);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Outfit, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${valLabel} ${unit}`, padding - 6, y + 3);
  }

  // Draw Line Curve
  ctx.beginPath();
  const step = graphW / Math.max(values.length - 1, 1);

  values.forEach((v, i) => {
    const x = padding + i * step;
    const y = padding + graphH - ((v - min) / (max - min)) * graphH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gradient fill under curve
  ctx.lineTo(padding + (values.length - 1) * step, padding + graphH);
  ctx.lineTo(padding, padding + graphH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padding, 0, padding + graphH);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
  grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw Points
  values.forEach((v, i) => {
    const x = padding + i * step;
    const y = padding + graphH - ((v - min) / (max - min)) * graphH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#080b11';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}
