import "./App.css";
import "leaflet/dist/leaflet.css";
import locationIconUrl from "./assets/location.png";

import { Icon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

const METERS_PER_MILE = 1609.344;

function SetMapCenter({ center }) {

  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 13);
    }
  }, [center, map]);

  return null;

}

export default function App() {

  const [userLocation, setUserLocation] = useState(null);
  const [radiusMiles, setRadiusMiles] = useState(10);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([
          position.coords.latitude,
          position.coords.longitude,
        ]);
      },
      (error) => {
        console.error("Could not get user location:", error);
      }
    );
  }, []);

  const locationIcon = useMemo(() => new Icon({
    iconUrl: locationIconUrl,
    iconSize: [32, 32],
    popupAnchor: [0, -32],
  }), []);

  const defaultCenter = [48.8566, 2.3522];
  const radiusMeters = radiusMiles * METERS_PER_MILE;

  return (
    <>
      <MapContainer
        center={userLocation ?? defaultCenter}
        zoom={13}
        scrollWheelZoom={true}
      >
        <SetMapCenter center={userLocation} />

        <TileLayer
          attribution=""
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {userLocation && (
          <>
            <Circle
              center={userLocation}
              radius={radiusMeters}
              pathOptions={{
                color: "#2563eb",
                dashArray: "10 10",
                fillColor: "#3b82f6",
                fillOpacity: 0.12,
                weight: 2,
              }}
            />

            <Marker position={userLocation} icon={locationIcon}>
              <Popup>You are here</Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div className="radius-control">
        <label htmlFor="radius">
          Radius: {radiusMiles} miles
        </label>
        <input
          id="radius"
          type="range"
          min="5"
          max="100"
          step="1"
          value={radiusMiles}
          onChange={(event) => setRadiusMiles(Number(event.target.value))}
        />
      </div>
    </>
  );
}
