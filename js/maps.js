/**
 * GIS & Leaflet Maps Controller for Nagrik Setu
 */
const MapService = {
  pickerMap: null,
  pickerMarker: null,
  adminMap: null,
  heatLayer: null,
  defaultCoords: [19.2183, 72.9781], // Thane default

  initPickerMap(onLocationSelect) {
    if (this.pickerMap) return;

    this.pickerMap = L.map('citizenPickerMap').setView(this.defaultCoords, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.pickerMap);

    this.pickerMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (this.pickerMarker) {
        this.pickerMarker.setLatLng(e.latlng);
      } else {
        this.pickerMarker = L.marker(e.latlng).addTo(this.pickerMap);
      }
      onLocationSelect(lat, lng);
    });
  },

  initAdminHeatmap(complaints) {
    if (this.adminMap) {
      this.adminMap.remove();
    }

    this.adminMap = L.map('adminGisMap').setView(this.defaultCoords, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.adminMap);

    const heatPoints = complaints
      .filter((c) => c.lat && c.lng)
      .map((c) => [c.lat, c.lng, parseFloat(c.priority) / 10]);

    if (heatPoints.length > 0 && typeof L.heatLayer === 'function') {
      this.heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17 }).addTo(this.adminMap);
    }
  }
};