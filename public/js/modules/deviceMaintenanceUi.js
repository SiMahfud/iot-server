// =============================================================
// Remote Device Maintenance (Reboot & Factory Reset) Module
// AgyGateway Universal IoT Server v4.0
// =============================================================

import { state, showToast } from '../state.js';

export function initDeviceMaintenanceUi() {
  const modal = document.getElementById('modalDeviceMaintenance');
  const btnOpen = document.getElementById('btnOpenDeviceMaintenance');
  const btnClose = document.getElementById('btnCloseDeviceMaintenance');
  const labelDev = document.getElementById('maintDeviceLabel');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      if (labelDev) {
        const isOnline = dev.isOnline;
        labelDev.innerHTML = `Perangkat: <strong>${dev.name || dev.deviceId}</strong> (${dev.deviceId}) &bull; <span style="color: ${isOnline ? 'var(--primary-glow)' : 'var(--danger-glow)'}">${isOnline ? '🟢 Online' : '🔴 Offline'}</span>`;
      }

      modal.classList.remove('hidden');
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Tutup jika klik di luar area modal card
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }

  // --- Action 1: Remote Reboot (Soft Restart) ---
  document.querySelectorAll('.btn-trigger-reboot').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      if (!dev.isOnline) {
        showToast(`Perangkat "${dev.name || dev.deviceId}" sedang offline. Tidak dapat reboot.`, false);
        return;
      }

      if (!confirm(`Reboot perangkat "${dev.name || dev.deviceId}" sekarang?\n\nPerangkat akan restart dan online kembali dalam beberapa detik.`)) {
        return;
      }

      const origText = btn.innerHTML;
      btn.innerHTML = '⏳ Mengirim...';
      btn.disabled = true;

      fetch(`/api/devices/${encodeURIComponent(dev.deviceId)}/reboot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`🔄 Perintah reboot dikirim ke ${dev.name || dev.deviceId}! Perangkat sedang restart...`);
          if (modal) modal.classList.add('hidden');
        } else {
          showToast(res.message || 'Gagal mengirim instruksi reboot', false);
        }
      })
      .catch(err => showToast(err.message, false))
      .finally(() => {
        btn.innerHTML = origText;
        btn.disabled = false;
      });
    });
  });

  // --- Action 2: Reset Konfigurasi Pin / Dynamic Pins ---
  document.querySelectorAll('.btn-trigger-reset-pins').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      if (!confirm(`Hapus SEMUA konfigurasi pin dan modul pada "${dev.name || dev.deviceId}"?\n\nTindakan ini akan mengosongkan seluruh saklar, sensor, dan pin dinamis yang tersimpan.`)) {
        return;
      }

      const origText = btn.innerHTML;
      btn.innerHTML = '⏳ Mereset...';
      btn.disabled = true;

      fetch(`/api/devices/${encodeURIComponent(dev.deviceId)}/reset-pins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`🧹 Seluruh pin dinamis ${dev.name || dev.deviceId} berhasil direset!`);
          if (res.device) {
            state.devices[dev.deviceId] = { ...(state.devices[dev.deviceId] || {}), ...res.device };
            state.setDevices({ ...state.devices });
          }
          if (modal) modal.classList.add('hidden');
          const modalPinMgr = document.getElementById('modalPinManager');
          if (modalPinMgr) modalPinMgr.classList.add('hidden');
        } else {
          showToast(res.message || 'Gagal mereset pin', false);
        }
      })
      .catch(err => showToast(err.message, false))
      .finally(() => {
        btn.innerHTML = origText;
        btn.disabled = false;
      });
    });
  });

  // --- Action 3: Remote Factory Reset (WiFi & Storage Erase) ---
  document.querySelectorAll('.btn-trigger-factory-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = state.getActiveDevice();
      if (!dev) {
        showToast('Pilih perangkat IoT terlebih dahulu', false);
        return;
      }

      if (!dev.isOnline) {
        showToast(`Perangkat "${dev.name || dev.deviceId}" sedang offline.`, false);
        return;
      }

      const inputConfirm = prompt(
        `⚠️ PERINGATAN KERAS: Remote Factory Reset!\n\n` +
        `Perangkat "${dev.name || dev.deviceId}" akan menghapus total kredensial WiFi dan memori flash internal.\n` +
        `Perangkat akan LANGSUNG OFFLINE dan kembali ke mode Access Point / Setup awal!\n\n` +
        `Ketik "RESET" (huruf besar) untuk melanjutkan:`
      );

      if (inputConfirm !== 'RESET') {
        if (inputConfirm !== null) {
          showToast('Konfirmasi dibatalkan (kata kunci tidak sesuai)', false);
        }
        return;
      }

      const origText = btn.innerHTML;
      btn.innerHTML = '⏳ Menghapus...';
      btn.disabled = true;

      fetch(`/api/devices/${encodeURIComponent(dev.deviceId)}/factory-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        }
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          showToast(`⚠️ Instruksi Factory Reset berhasil dikirim ke ${dev.name || dev.deviceId}! Perangkat akan restart ke AP Mode.`);
          if (modal) modal.classList.add('hidden');
          const modalPinMgr = document.getElementById('modalPinManager');
          if (modalPinMgr) modalPinMgr.classList.add('hidden');
        } else {
          showToast(res.message || 'Gagal mengirim instruksi factory reset', false);
        }
      })
      .catch(err => showToast(err.message, false))
      .finally(() => {
        btn.innerHTML = origText;
        btn.disabled = false;
      });
    });
  });
}
