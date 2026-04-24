import "./App.css";
import "leaflet/dist/leaflet.css";
import L, { Icon } from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import locationIconUrl from "./assets/location.png";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_MILES = 3958.8;
const CONTRACTORS_STORAGE_KEY = "contractors";
const LEGACY_CONTRACTOR_STORAGE_KEY = "contractorProfile";
const DEFAULT_CENTER = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;
const LOCATION_ZOOM = 11;

const WORK_TYPES = [
  "General contracting",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Roofing",
  "Concrete",
  "Painting",
  "Flooring",
  "Landscaping",
  "Carpentry",
];

const initialFormData = {
  name: "",
  phone: "",
  address: "",
  rating: "5.0",
  workTypes: [],
};

function formatCoordinate(value) {
  return value.toFixed(6);
}

function formatRating(rating) {
  return Number.isFinite(rating) ? `${rating.toFixed(1)} / 5` : "New";
}

function formatPhoneHref(phoneNumber) {
  return phoneNumber.replace(/[^\d+]/g, "");
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function getDistanceMiles(firstPoint, secondPoint) {
  const [lat1, lon1] = firstPoint;
  const [lat2, lon2] = secondPoint;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeContractor(contractor) {
  if (!contractor?.name || !Number.isFinite(Number(contractor.latitude)) || !Number.isFinite(Number(contractor.longitude))) {
    return null;
  }

  const rating = Number(contractor.rating);

  return {
    id: contractor.id ?? crypto.randomUUID(),
    name: contractor.name,
    phoneNumber: contractor.phoneNumber ?? contractor.phone ?? "",
    address: contractor.address ?? "",
    rating: Number.isFinite(rating) ? rating : null,
    latitude: Number(contractor.latitude),
    longitude: Number(contractor.longitude),
    serviceRadiusMiles: Number(contractor.serviceRadiusMiles ?? 10),
    workTypes: Array.isArray(contractor.workTypes) ? contractor.workTypes : [],
    savedAt: contractor.savedAt ?? new Date().toISOString(),
  };
}

function loadContractors() {
  try {
    const savedContractors = JSON.parse(localStorage.getItem(CONTRACTORS_STORAGE_KEY));

    if (Array.isArray(savedContractors)) {
      return savedContractors.map(normalizeContractor).filter(Boolean);
    }
  } catch {
    localStorage.removeItem(CONTRACTORS_STORAGE_KEY);
  }

  try {
    const legacyContractor = normalizeContractor(
      JSON.parse(localStorage.getItem(LEGACY_CONTRACTOR_STORAGE_KEY)),
    );

    return legacyContractor ? [legacyContractor] : [];
  } catch {
    return [];
  }
}

function getRoute() {
  if (window.location.pathname === "/contractor-signup") {
    return "/contractor-signup";
  }

  return "/customer";
}

function RecenterMap({ target }) {
  const map = useMap();

  useEffect(() => {
    if (target?.center) {
      map.setView(target.center, target.zoom);
      window.setTimeout(() => map.invalidateSize(), 0);
    }
  }, [map, target]);

  return null;
}

function ServiceCenterTracker({ onCenterChange }) {
  const map = useMapEvents({
    move() {
      const center = map.getCenter();
      onCenterChange([center.lat, center.lng]);
    },
  });

  useEffect(() => {
    const center = map.getCenter();
    onCenterChange([center.lat, center.lng]);
  }, [map, onCenterChange]);

  return null;
}

function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map]);

  return null;
}

function addPopupRow(container, label, value) {
  const row = document.createElement("div");
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");

  labelElement.textContent = label;
  valueElement.textContent = value || "Not provided";
  row.append(labelElement, valueElement);
  container.append(row);
}

function createContractorPopup(contractor) {
  const popup = document.createElement("div");
  const title = document.createElement("h3");
  const rating = document.createElement("p");
  const details = document.createElement("div");
  const actions = document.createElement("div");
  const phoneHref = formatPhoneHref(contractor.phoneNumber);

  popup.className = "contractor-popup";
  title.textContent = contractor.name;
  rating.textContent = `Rating: ${formatRating(contractor.rating)}`;
  details.className = "contractor-popup-details";
  actions.className = "contractor-popup-actions";

  addPopupRow(details, "Phone", contractor.phoneNumber);
  addPopupRow(details, "Address", contractor.address);
  addPopupRow(details, "Work", contractor.workTypes.join(", "));
  addPopupRow(details, "Distance", `${contractor.distanceMiles.toFixed(1)} miles away`);
  addPopupRow(details, "Radius", `${contractor.serviceRadiusMiles} miles`);

  if (phoneHref) {
    const callLink = document.createElement("a");
    const messageLink = document.createElement("a");

    callLink.href = `tel:${phoneHref}`;
    callLink.textContent = "Call";
    callLink.className = "popup-action primary";

    messageLink.href = `sms:${phoneHref}`;
    messageLink.textContent = "Message";
    messageLink.className = "popup-action";

    actions.append(callLink, messageLink);
  }

  popup.append(title, rating, details, actions);

  return popup;
}

function ContractorClusterLayer({ contractors, icon }) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });

    contractors.forEach((contractor) => {
      const marker = L.marker([contractor.latitude, contractor.longitude], { icon });

      marker.bindPopup(createContractorPopup(contractor), {
        maxWidth: 320,
        minWidth: 260,
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [contractors, icon, map]);

  return null;
}

function AppNav({ route, onNavigate }) {
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <a
        className={route === "/customer" ? "active" : ""}
        href="/customer"
        onClick={(event) => onNavigate(event, "/customer")}
      >
        Customer Search
      </a>
      <a
        className={route === "/contractor-signup" ? "active" : ""}
        href="/contractor-signup"
        onClick={(event) => onNavigate(event, "/contractor-signup")}
      >
        Contractor Signup
      </a>
    </nav>
  );
}

function ContractorSignupPage({ contractors, locationIcon, onSaveContractor }) {
  const [formData, setFormData] = useState(initialFormData);
  const [userLocation, setUserLocation] = useState(null);
  const [serviceCenter, setServiceCenter] = useState(DEFAULT_CENTER);
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [locationStatus, setLocationStatus] = useState("Finding current location...");
  const [saveMessage, setSaveMessage] = useState("");
  const [mapTarget, setMapTarget] = useState({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    id: "default",
  });
  const requestedLocation = useRef(false);

  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const latestContractor = contractors[0];

  const moveMapTo = useCallback((center, zoom = LOCATION_ZOOM) => {
    setServiceCenter(center);
    setMapTarget({
      center,
      zoom,
      id: `${center[0]}-${center[1]}-${Date.now()}`,
    });
  }, []);

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Current location is not available in this browser.");
      return;
    }

    setLocationStatus("Finding current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLocation = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        setUserLocation(currentLocation);
        moveMapTo(currentLocation);
        setLocationStatus("Using current location as the starting point.");
      },
      () => {
        setLocationStatus("Current location could not be found.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      },
    );
  }, [moveMapTo]);

  useEffect(() => {
    if (!requestedLocation.current) {
      requestedLocation.current = true;
      requestCurrentLocation();
    }
  }, [requestCurrentLocation]);

  function handleInputChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleWorkTypeChange(workType) {
    setFormData((current) => {
      const isSelected = current.workTypes.includes(workType);

      return {
        ...current,
        workTypes: isSelected
          ? current.workTypes.filter((item) => item !== workType)
          : [...current.workTypes, workType],
      };
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (formData.workTypes.length === 0) {
      setSaveMessage("Select at least one type of work.");
      return;
    }

    const contractorProfile = {
      id: crypto.randomUUID(),
      name: formData.name.trim(),
      phoneNumber: formData.phone.trim(),
      address: formData.address.trim(),
      rating: Number(formData.rating),
      latitude: Number(formatCoordinate(serviceCenter[0])),
      longitude: Number(formatCoordinate(serviceCenter[1])),
      serviceRadiusMiles: radiusMiles,
      workTypes: formData.workTypes,
      savedAt: new Date().toISOString(),
    };

    onSaveContractor(contractorProfile);
    setFormData(initialFormData);
    setSaveMessage(`Saved ${contractorProfile.name}.`);
  }

  return (
    <main className="split-page">
      <section className="form-panel" aria-label="Contractor information">
        <header className="form-header">
          <p>Contractor Intake</p>
          <h1>Service Profile</h1>
        </header>

        <form className="contractor-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span>Name</span>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </label>

          <label className="field-group">
            <span>Phone number</span>
            <input
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleInputChange}
              required
            />
          </label>

          <label className="field-group">
            <span>Rating</span>
            <input
              name="rating"
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={formData.rating}
              onChange={handleInputChange}
              required
            />
          </label>

          <label className="field-group">
            <span>Address</span>
            <textarea
              name="address"
              rows="3"
              value={formData.address}
              onChange={handleInputChange}
              required
            />
          </label>

          <fieldset className="work-section">
            <legend>Type of work</legend>
            <div className="work-type-grid">
              {WORK_TYPES.map((workType) => (
                <label className="work-type-option" key={workType}>
                  <input
                    type="checkbox"
                    checked={formData.workTypes.includes(workType)}
                    onChange={() => handleWorkTypeChange(workType)}
                  />
                  <span>{workType}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="radius-section">
            <label htmlFor="radius">Service radius: {radiusMiles} miles</label>
            <input
              id="radius"
              type="range"
              min="10"
              max="100"
              step="1"
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(Number(event.target.value))}
            />
          </div>

          <div className="coordinate-section">
            <label className="field-group">
              <span>Latitude</span>
              <input value={formatCoordinate(serviceCenter[0])} readOnly />
            </label>

            <label className="field-group">
              <span>Longitude</span>
              <input value={formatCoordinate(serviceCenter[1])} readOnly />
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={requestCurrentLocation}>
              Use Current Location
            </button>
            <button type="submit" className="primary-button">
              Save Contractor
            </button>
          </div>

          {saveMessage && (
            <p className="save-message" role="status">
              {saveMessage}
            </p>
          )}
        </form>

        <section className="saved-summary" aria-label="Saved contractors">
          <h2>Saved Contractors</h2>
          {latestContractor ? (
            <dl>
              <div>
                <dt>Latest</dt>
                <dd>{latestContractor.name}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{contractors.length}</dd>
              </div>
              <div>
                <dt>Rating</dt>
                <dd>{formatRating(latestContractor.rating)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {latestContractor.latitude}, {latestContractor.longitude}
                </dd>
              </div>
              <div>
                <dt>Radius</dt>
                <dd>{latestContractor.serviceRadiusMiles} miles</dd>
              </div>
            </dl>
          ) : (
            <p className="empty-state">No contractors saved yet.</p>
          )}
        </section>
      </section>

      <section className="map-panel" aria-label="Service area map">
        <MapContainer
          className="service-map"
          center={serviceCenter}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom={true}
        >
          <MapSizeFix />
          <RecenterMap target={mapTarget} />
          <ServiceCenterTracker onCenterChange={setServiceCenter} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Circle
            center={serviceCenter}
            radius={radiusMeters}
            pathOptions={{
              color: "#2563eb",
              dashArray: "10 10",
              fillColor: "#3b82f6",
              fillOpacity: 0.14,
              weight: 2,
            }}
          />

          <Marker position={serviceCenter} icon={locationIcon}>
            <Popup>Service center</Popup>
          </Marker>

          {userLocation && (
            <CircleMarker
              center={userLocation}
              radius={7}
              pathOptions={{
                color: "#047857",
                fillColor: "#10b981",
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>Current location</Popup>
            </CircleMarker>
          )}
        </MapContainer>

        <div className="map-readout">
          <span>Service center</span>
          <strong>
            {formatCoordinate(serviceCenter[0])}, {formatCoordinate(serviceCenter[1])}
          </strong>
          <small>{locationStatus}</small>
        </div>
      </section>
    </main>
  );
}

function CustomerPage({ contractors, locationIcon }) {
  const [customerLocation, setCustomerLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Finding current location...");
  const [workFilter, setWorkFilter] = useState("All");
  const [mapTarget, setMapTarget] = useState({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    id: "default",
  });
  const requestedLocation = useRef(false);

  const requestCustomerLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Current location is not available in this browser.");
      return;
    }

    setLocationStatus("Finding current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLocation = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        setCustomerLocation(currentLocation);
        setMapTarget({
          center: currentLocation,
          zoom: LOCATION_ZOOM,
          id: `${currentLocation[0]}-${currentLocation[1]}-${Date.now()}`,
        });
        setLocationStatus("Using current location.");
      },
      () => {
        setLocationStatus("Current location could not be found.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      },
    );
  }, []);

  useEffect(() => {
    if (!requestedLocation.current) {
      requestedLocation.current = true;
      requestCustomerLocation();
    }
  }, [requestCustomerLocation]);

  const matchingContractors = useMemo(() => {
    if (!customerLocation) {
      return [];
    }

    return contractors
      .map((contractor) => {
        const distanceMiles = getDistanceMiles(customerLocation, [
          contractor.latitude,
          contractor.longitude,
        ]);

        return {
          ...contractor,
          distanceMiles,
          servicesCustomer: distanceMiles <= contractor.serviceRadiusMiles,
        };
      })
      .filter((contractor) => contractor.servicesCustomer)
      .filter((contractor) => (
        workFilter === "All" || contractor.workTypes.includes(workFilter)
      ))
      .sort((first, second) => first.distanceMiles - second.distanceMiles);
  }, [contractors, customerLocation, workFilter]);

  return (
    <main className="split-page customer-page">
      <section className="results-panel" aria-label="Contractor results">
        <header className="form-header">
          <p>Customer Search</p>
          <h1>Available Contractors</h1>
        </header>

        <div className="customer-controls">
          <button type="button" className="primary-button" onClick={requestCustomerLocation}>
            Use Current Location
          </button>

          <label className="field-group">
            <span>Needed work</span>
            <select value={workFilter} onChange={(event) => setWorkFilter(event.target.value)}>
              <option>All</option>
              {WORK_TYPES.map((workType) => (
                <option key={workType}>{workType}</option>
              ))}
            </select>
          </label>

          <div className="lookup-status">
            <span>Customer location</span>
            <strong>
              {customerLocation
                ? `${formatCoordinate(customerLocation[0])}, ${formatCoordinate(customerLocation[1])}`
                : "Not set"}
            </strong>
            <small>{locationStatus}</small>
          </div>
        </div>

        <section className="contractor-results">
          <div className="results-heading">
            <h2>Matches</h2>
            <span>{matchingContractors.length}</span>
          </div>

          {matchingContractors.length > 0 ? (
            <div className="contractor-list">
              {matchingContractors.map((contractor) => (
                <article className="contractor-card" key={contractor.id}>
                  <div>
                    <h3>{contractor.name}</h3>
                    <p>{contractor.workTypes.join(", ")}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Rating</dt>
                      <dd>{formatRating(contractor.rating)}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{contractor.phoneNumber}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>{contractor.address}</dd>
                    </div>
                    <div>
                      <dt>Distance</dt>
                      <dd>{contractor.distanceMiles.toFixed(1)} miles away</dd>
                    </div>
                    <div>
                      <dt>Radius</dt>
                      <dd>{contractor.serviceRadiusMiles} miles</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {customerLocation
                ? "No saved contractors service this location."
                : "Set a customer location to search saved contractors."}
            </p>
          )}
        </section>
      </section>

      <section className="map-panel" aria-label="Customer contractor map">
        <MapContainer
          className="service-map"
          center={customerLocation ?? DEFAULT_CENTER}
          zoom={customerLocation ? LOCATION_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom={true}
        >
          <MapSizeFix />
          <RecenterMap target={mapTarget} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ContractorClusterLayer contractors={matchingContractors} icon={locationIcon} />

          {customerLocation && (
            <CircleMarker
              center={customerLocation}
              radius={8}
              pathOptions={{
                color: "#047857",
                fillColor: "#10b981",
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>Your location</Popup>
            </CircleMarker>
          )}
        </MapContainer>

        <div className="map-readout">
          <span>Customer search</span>
          <strong>{matchingContractors.length} contractors in range</strong>
          <small>{locationStatus}</small>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [contractors, setContractors] = useState(loadContractors);

  const locationIcon = useMemo(() => new Icon({
    iconUrl: locationIconUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  }), []);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState(null, "", "/customer");
    }

    function handlePopState() {
      setRoute(getRoute());
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem(CONTRACTORS_STORAGE_KEY, JSON.stringify(contractors));
  }, [contractors]);

  function handleNavigate(event, nextRoute) {
    event.preventDefault();
    window.history.pushState(null, "", nextRoute);
    setRoute(nextRoute);
  }

  function handleSaveContractor(contractor) {
    setContractors((current) => [contractor, ...current]);
  }

  return (
    <>
      <AppNav route={route} onNavigate={handleNavigate} />
      {route === "/contractor-signup" ? (
        <ContractorSignupPage
          contractors={contractors}
          locationIcon={locationIcon}
          onSaveContractor={handleSaveContractor}
        />
      ) : (
        <CustomerPage contractors={contractors} locationIcon={locationIcon} />
      )}
    </>
  );
}
