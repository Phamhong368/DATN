import React, { useEffect, useRef, useState } from 'react'
import { initMap } from './mapService' // Giả sử bạn có một file mapService.js để khởi tạo bản đồ

function OnboardingPage(props) {
  const [mapError, setMapError] = useState(null)
  const mapRef = useRef(null)

  async function initMapSafe() {
    try {
      if (!window.google || !window.google.maps) {
        throw new Error('Google Maps chưa được load. Kiểm tra API key và network.')
      }
      if (typeof initMap === 'function') {
        await initMap()
      } else {
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: 10.762622, lng: 106.660172 },
          zoom: 12,
        })
        try {
          const directionsService = new window.google.maps.DirectionsService()
          const directionsRenderer = new window.google.maps.DirectionsRenderer()
          directionsRenderer.setMap(map)
        } catch (innerErr) {
          console.error('Directions init failed:', innerErr)
        }
      }
      setMapError(null)
    } catch (err) {
      console.error('Init map failed:', err)
      setMapError(err?.message || String(err))
    }
  }

  useEffect(() => {
    initMapSafe()
    return () => {
      // cleanup nếu cần
    }
  }, [])

  if (mapError) {
    return (
      <div style={{ padding: 20 }}>
        <h3>Rất tiếc! Đã xảy ra lỗi.</h3>
        <p>{mapError}</p>
        <p>Kiểm tra console (DevTools) → Network để xem lỗi chính xác (MissingKey/InvalidKey/Referer/Billing).</p>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      {/* ...existing code... */}
      <div id="map" ref={mapRef} style={{ width: '100%', height: 420 }} />
      {/* ...existing code... */}
    </div>
  )
}

export default OnboardingPage