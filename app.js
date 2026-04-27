const SUPABASE_URL = "https://ukczpgehcuirxsbgykhz.supabase.co";
const SUPABASE_KEY = "sb_publishable_C-p5LZj6yYo_0DRDNSQjMg_ipfMdWqU";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let selectedLat, selectedLng;
let tempMarker;

var map = L.map('map', {
  center: [17.385, 78.4867],
  zoom: 7,
  maxBounds: [
    [15.8, 77.0],
    [19.9, 81.5]
  ],
  maxBoundsViscosity: 1.0
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

// ─── Load approved feeders onto the map ──────────────────────────────────────
async function loadFeeders() {
  const { data: feeders, error } = await supabaseClient
    .from("feeder_approved")
    .select("*");

  if (error) {
    console.error("Error loading feeders:", error);
    return;
  }

  feeders.forEach(f => {
    const popupHTML = `
      <b>${f.name}</b><br/>
      <button onclick="requestContact(${f.id}, '${f.name}')">
        📞 Request Phone Number
      </button>
    `;
    L.marker([f.lat, f.lng])
      .addTo(map)
      .bindPopup(popupHTML);
  });
}

// ─── Search by pincode or area ────────────────────────────────────────────────
async function searchLocation() {
  const addr = document.getElementById("address").value;
  if (!addr) {
    alert("Enter pincode or area");
    return;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${addr}`);
    const data = await res.json();
    if (!data.length) {
      alert("Not found");
      return;
    }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);

    if (lat < 15.8 || lat > 19.9 || lng < 77 || lng > 81.5) {
      alert("Currently only Telangana is supported");
      if (tempMarker) map.removeLayer(tempMarker);
      return;
    }

    selectedLat = lat;
    selectedLng = lng;
    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 13);

    await showNearbyFeeders(lat, lng);

  } catch (err) {
    console.error(err);
    alert("Search failed");
  }
}

// ─── Show nearby feeders in the resultsList div ───────────────────────────────
async function showNearbyFeeders(lat, lng) {
  const radius = 0.05;

  const { data: feeders, error } = await supabaseClient
    .from("feeder_approved")
    .select("id, name, lat, lng")
    .gte("lat", lat - radius)
    .lte("lat", lat + radius)
    .gte("lng", lng - radius)
    .lte("lng", lng + radius);

  if (error) {
    console.error(error);
    return;
  }

  const resultsList = document.getElementById("resultsList");
  resultsList.innerHTML = "";

  if (!feeders.length) {
    resultsList.innerHTML = "<p style='color:gray; font-size:13px;'>No feeders found in this area.</p>";
    return;
  }

  feeders.forEach(f => {
    const item = document.createElement("div");
    item.style.cssText = "padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px;";
    item.innerHTML = `
      🐾 <b>${f.name}</b><br/>
      <button
        onclick="requestContact(${f.id}, '${f.name}')"
        style="margin-top:4px; font-size:12px; padding:3px 8px; cursor:pointer;">
        📞 Request Contact
      </button>
    `;
    resultsList.appendChild(item);
  });
}

// ─── Map click to select location ────────────────────────────────────────────
map.on('click', async function(e) {
  selectedLat = e.latlng.lat;
  selectedLng = e.latlng.lng;

  if (selectedLat < 15.8 || selectedLat > 19.9 || selectedLng < 77 || selectedLng > 81.5) {
    alert("Only Telangana allowed");
    return;
  }

  if (tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker([selectedLat, selectedLng]).addTo(map);

  await showNearbyFeeders(selectedLat, selectedLng);
});

// ─── Submit new feeder to feeder_pending ─────────────────────────────────────
async function submitFeeder() {
  const feederName = document.getElementById("name").value.trim();
  const feederPhone = document.getElementById("phone").value.trim();
  const feederRole = document.getElementById("role").value;

    console.log("Submitting role:", role); 

  if (!feederName || !feederPhone || selectedLat === undefined || selectedLng === undefined) {
    alert("Fill all fields and select a location on the map");
    return;
  }
  if (!/^[0-9]{10}$/.test(feederPhone)) {
    alert("Enter a valid 10-digit phone number");
    return;
  }

  const { error } = await supabaseClient
    .from("feeder_pending")
    .insert([{ name:feederName, phone:feederPhone, role: feederRole, lat: selectedLat, lng: selectedLng }]);

  if (error) {
    console.error(error);
    alert("Error submitting. Please try again.");
  } else {
    alert("Submitted! You will be added to the map once approved.");
    document.getElementById("name").value = "";
    document.getElementById("phone").value = "";
    document.getElementById("role").value = "Feeder";
    selectedLat = undefined;
    selectedLng = undefined;
    if (tempMarker) {
      map.removeLayer(tempMarker);
      tempMarker = null;
    }
  }
}

// ─── Log contact request to feeder_contact ───────────────────────────────────
async function requestContact(feederId, feederName) {
  const requesterPhone = prompt(`Enter your phone number to request ${feederName}'s contact:`);

  if (!requesterPhone) return;
  if (!/^[0-9]{10}$/.test(requesterPhone)) {
    alert("Enter a valid 10-digit phone number");
    return;
  }

  const { error } = await supabaseClient
    .from("contact_requests")
    .insert([{
      feeder_id: feederId,
      requester_phone: requesterPhone
    }]);

  if (error) {
    console.error(error);
    alert("Error sending request. Please try again.");
  } else {
    alert("Request sent! The admin will share the contact with you shortly.");
  }
}

function handleDisclaimerSubmit() {
  const checked = document.getElementById("disclaimerCheck").checked;
  if (!checked) {
    alert("Please read and check the box to confirm your agreement before submitting.");
    return;
  }
 // Read role BEFORE closing popup or resetting anything
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const role = document.getElementById("role").value;

  // Close popup and reset checkbox
  document.getElementById("disclaimerPopup").style.display = "none";
  document.getElementById("disclaimerCheck").checked = false;

  // Proceed with actual submission
  submitFeeder();
}

window.handleDisclaimerSubmit = handleDisclaimerSubmit;

window.searchLocation = searchLocation;
window.submitFeeder = submitFeeder;
window.requestContact = requestContact;

loadFeeders();