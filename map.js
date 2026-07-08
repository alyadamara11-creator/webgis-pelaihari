import { dbService } from './dbService.js';

let map;
let markersCluster;
let heatLayer;

export const mapService = {
    initMap(elementId) {
        map = L.map(elementId).setView([-3.800, 114.760], 13);
        L.tileLayer('http://mt0.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}', {
            attribution: '© Google Maps | Alya Edition'
        }).addTo(map);

        markersCluster = L.markerClusterGroup({ maxClusterRadius: 60 });
        heatLayer = L.heatLayer([], { radius: 25, blur: 15 });
        map.addLayer(markersCluster);
    },

    toggleHeatmap(isActive) {
        if (isActive) {
            map.removeLayer(markersCluster);
            map.addLayer(heatLayer);
        } else {
            map.removeLayer(heatLayer);
            map.addLayer(markersCluster);
        }
    },

    async renderPoints(dataArray, showOnlyCritical) {
        markersCluster.clearLayers();
        let heatPoints = [];
        let stats = { mulus: 0, sedang: 0, rusak: 0 };
        let filteredCount = 0;

        for (const row of dataArray) {
            let isDamaged = row.mag >= 1.2;
            let statKey = row.mag >= 1.7 ? 'rusak' : (row.mag >= 1.2 ? 'sedang' : 'mulus');
            stats[statKey]++;

            if (showOnlyCritical && !isDamaged) continue;
            filteredCount++;

            let color = statKey === 'rusak' ? '#ef4444' : (statKey === 'sedang' ? '#f59e0b' : '#10b981');
            let marker = L.circleMarker([row.lat, row.lon], { color: color, fillColor: color, fillOpacity: 0.9, radius: isDamaged ? 7 : 5 });

            // INTERAKSI 1: Hover Tooltip (Cepat & Ringkas)
            marker.bindTooltip(`
                <div style="text-align:center;">
                    <b style="color:${color}; font-size:12px;">${statKey.toUpperCase()}</b><br>
                    <span style="font-size:11px; color:#475569;">G: ${row.mag} g | Lux: ${row.lux}</span>
                </div>
            `, { direction: 'top', offset: [0, -5] });

            let uniqueId = `foto_${row.lat.toString().replace(/[\.\-]/g, '')}_${row.lon.toString().replace(/[\.\-]/g, '')}`;

            // INTERAKSI 2: Klik Popup (Menampilkan Detail Forensik CSV Penuh)
            let popupHTML = `
                <div class="font-sans min-w-[220px] text-slate-700">
                    <h4 class="font-bold border-b border-slate-200 pb-1 mb-2 text-slate-800 text-[13px]">Detail Forensik Sensor</h4>
                    <table class="text-[11px] w-full mb-2">
                        <tr><td class="font-semibold w-1/3 text-slate-500">Tanggal</td><td>: ${row.tanggal}</td></tr>
                        <tr><td class="font-semibold text-slate-500">Waktu</td><td>: ${row.waktu}</td></tr>
                        <tr><td class="font-semibold text-slate-500">Koor</td><td>: ${row.lat.toFixed(6)}, ${row.lon.toFixed(6)}</td></tr>
                        <tr><td class="font-semibold text-slate-500">G-Force</td><td>: <b style="color:${color}">${row.mag} g</b></td></tr>
                        <tr><td class="font-semibold text-slate-500">Cahaya</td><td>: ${row.lux} Lux</td></tr>
                    </table>
            `;
            
            // Injeksi Fitur Upload Foto Khusus Titik Rusak
            if (isDamaged) {
                let savedImage = await dbService.getPhoto(uniqueId);
                let imgDisplay = savedImage ? "block" : "none";
                let btnDisplay = savedImage ? "none" : "block";

                popupHTML += `
                    <div class="bg-slate-50 p-2 rounded border border-slate-200 mt-2">
                        <p class="text-[11px] font-bold mb-1 text-slate-600">📸 Bukti Validasi Lapangan:</p>
                        <img id="img-${uniqueId}" src="${savedImage || ''}" style="width:100%; border-radius:4px; display:${imgDisplay}; margin-bottom:5px; border: 1px solid #cbd5e1;">
                        <input type="file" accept="image/*" class="text-[10px] w-full text-slate-500 file:mr-2 file:py-1 file:px-2 file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" style="display:${btnDisplay};" onchange="window.handlePhotoUpload(this, '${uniqueId}')">
                    </div>
                `;
            }
            popupHTML += `</div>`;
            marker.bindPopup(popupHTML);
            markersCluster.addLayer(marker);

            if (isDamaged) heatPoints.push([row.lat, row.lon, row.mag / 2]);
        }

        heatLayer.setLatLngs(heatPoints);
        return { stats, filteredCount };
    }
};

// Logika Global Injeksi Foto (Berjalan di RAM & IndexedDB)
window.handlePhotoUpload = async function(inputElement, imgId) {
    let file = inputElement.files[0];
    if (file) {
        let reader = new FileReader();
        reader.onload = function(e) {
            let img = new Image();
            img.onload = async function() {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                let MAX_WIDTH = 300;
                let scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                let base64Data = canvas.toDataURL('image/jpeg', 0.7);
                await dbService.savePhoto(imgId, base64Data);

                let imgTag = document.getElementById('img-' + imgId);
                imgTag.src = base64Data;
                imgTag.style.display = 'block'; 
                inputElement.style.display = 'none'; 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};
