import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import { MaterialIcons } from '@expo/vector-icons';

// ---------- 条件导入：原生端使用 react-native-maps，Web 端使用空组件 ----------
let MapView: any, Marker: any, Polyline: any, PROVIDER_GOOGLE: any;

if (Platform.OS !== 'web') {
  // 原生平台：真实地图
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} else {
  // Web 平台：占位组件
  MapView = ({ children, style, ...props }: any) => (
    <View
      style={[
        style,
        {
          backgroundColor: '#e0e0e0',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      <Text style={{ textAlign: 'center', color: '#666' }}>
        地图仅在移动端可用（Android / iOS）
      </Text>
      {children}
    </View>
  );
  Marker = () => null;
  Polyline = () => null;
  PROVIDER_GOOGLE = null;
}
// ----------------------------------------------------------------

interface Coordinates {
  latitude: number;
  longitude: number;
}

const TrackingScreen: React.FC = () => {
  const router = useRouter();
  const { destLat, destLng, fromLat, fromLng } = useLocalSearchParams();

  console.log(fromLat);
  console.log(fromLng);
  console.log(destLat);
  console.log(destLng);

  const parsedDestLat = typeof destLat === 'string' ? parseFloat(destLat) : NaN;
  const parsedDestLng = typeof destLng === 'string' ? parseFloat(destLng) : NaN;
  const parsedFromLat = typeof fromLat === 'string' ? parseFloat(fromLat) : NaN;
  const parsedFromLng = typeof fromLng === 'string' ? parseFloat(fromLng) : NaN;

  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(
    !isNaN(parsedFromLat) && !isNaN(parsedFromLng)
      ? { latitude: parsedFromLat, longitude: parsedFromLng }
      : null
  );
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinates[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [arrived, setArrived] = useState<boolean>(false);
  const [isValidCoordinates, setIsValidCoordinates] = useState<boolean>(true);
  const mapRef = useRef<any>(null);
  const watchId = useRef<Location.LocationSubscription | null>(null);

  // 50 meters balances GPS accuracy (5-20m) and proximity to bus stops in Salem, India
  const DESTINATION_RADIUS = 50; // Meters to consider "arrived"
  const API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY'; // 请替换为真实的 API Key

  // Validate coordinates on mount
  useEffect(() => {
    console.log('Parsed coordinates:', {
      parsedDestLat,
      parsedDestLng,
      parsedFromLat,
      parsedFromLng,
    });
    if (isNaN(parsedDestLat) || isNaN(parsedDestLng)) {
      setIsValidCoordinates(false);
      Alert.alert('Error', 'Invalid destination coordinates provided.');
    }
    if (!isNaN(parsedFromLat) && !isNaN(parsedFromLng)) {
      // Use geocoded fromAddress as initial location
      setCurrentLocation({ latitude: parsedFromLat, longitude: parsedFromLng });
      fetchDirections(parsedFromLat, parsedFromLng);
    }
  }, [parsedDestLat, parsedDestLng, parsedFromLat, parsedFromLng]);

  // Request location permission
  const requestLocationPermission = async (): Promise<void> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    console.log('Location permission status:', status);
    setHasPermission(status === 'granted');
    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'Location permission is required to track your journey.'
      );
    }
  };

  // Calculate distance between two coordinates
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const toRad = (value: number): number => (value * Math.PI) / 180;
    const R = 6371e3; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Decode Google Polyline
  const decodePolyline = (encoded: string): Coordinates[] => {
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;
    const coordinates: Coordinates[] = [];

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      coordinates.push({
        latitude: lat * 1e-5,
        longitude: lng * 1e-5,
      });
    }

    return coordinates;
  };

  // Fetch directions for transit mode only
  const fetchDirections = async (
    startLat: number,
    startLng: number
  ): Promise<boolean> => {
    if (
      isNaN(startLat) ||
      isNaN(startLng) ||
      isNaN(parsedDestLat) ||
      isNaN(parsedDestLng)
    ) {
      console.error('Invalid coordinates:', {
        startLat,
        startLng,
        parsedDestLat,
        parsedDestLng,
      });
      Alert.alert('Error', 'Invalid coordinates for route calculation.');
      return false;
    }

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/directions/json',
        {
          params: {
            origin: `${startLat},${startLng}`,
            destination: `${parsedDestLat},${parsedDestLng}`,
            key: API_KEY,
            mode: 'transit',
            departure_time: 'now',
          },
        }
      );

      if (response.data.status === 'OK') {
        const points = response.data.routes[0].overview_polyline.points;
        const decoded = decodePolyline(points);
        setRouteCoordinates(decoded);
        console.log('Route fetched successfully with transit mode');
        return true;
      } else if (response.data.status === 'ZERO_RESULTS') {
        console.warn('No bus routes found for transit mode');
        Alert.alert(
          'No Bus Route Found',
          'No bus route is available between your location and the destination. Try selecting a different bus stop or adjusting the addresses.'
        );
        return false;
      } else {
        console.error('Directions API error:', response.data.status);
        Alert.alert('Error', `Directions API failed: ${response.data.status}`);
        return false;
      }
    } catch (error) {
      console.error('Fetch directions error:', error);
      Alert.alert(
        'Error',
        'Failed to fetch bus route. Please check your network connection or try again later.'
      );
      return false;
    }
  };

  // Start location tracking
  const startLocationTracking = async (): Promise<void> => {
    if (!isValidCoordinates || watchId.current) return;

    console.log('Starting location tracking');
    watchId.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 10000,
      },
      async (position: Location.LocationObject) => {
        const { latitude, longitude } = position.coords;
        console.log('Current location:', { latitude, longitude });
        setCurrentLocation({ latitude, longitude });

        // Fetch route for transit mode
        if (routeCoordinates.length === 0) {
          const routeFound = await fetchDirections(latitude, longitude);
          if (!routeFound) {
            console.log('No route found after attempting transit mode');
          }
        }

        // Center map on user (仅原生平台)
        if (Platform.OS !== 'web' && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }

        // Check if destination reached
        const distance = calculateDistance(
          latitude,
          longitude,
          parsedDestLat,
          parsedDestLng
        );
        console.log('Distance to destination:', distance);
        if (distance <= DESTINATION_RADIUS && !arrived) {
          setArrived(true);
          Alert.alert(
            'Destination Reached',
            'You have arrived at your destination!'
          );
          stopLocationTracking();
        }
      },
      (error) => {
        console.error('Location error:', error);
        Alert.alert('Error', 'Failed to get location updates.');
      }
    );
  };

  // Stop location tracking
  const stopLocationTracking = (): void => {
    if (watchId.current) {
      console.log('Stopping location tracking');
      watchId.current.remove();
      watchId.current = null;
      router.back();
    }
  };

  // Check permission and start tracking
  useEffect(() => {
    const initialize = async (): Promise<void> => {
      const { status } = await Location.getForegroundPermissionsAsync();
      console.log('Location permission status:', status);
      if (status === 'granted') {
        setHasPermission(true);
        if (isValidCoordinates && !arrived) {
          if (!currentLocation && isNaN(parsedFromLat)) {
            startLocationTracking(); // Fallback to device location if no fromCoords
          }
        }
      } else {
        await requestLocationPermission();
      }
    };
    initialize();

    return () => stopLocationTracking();
  }, [isValidCoordinates, arrived, currentLocation]);

  return (
    <View style={styles.container}>
      <View
        style={{
          height: 80,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          backgroundColor: '#fff',
          paddingTop: 30,
        }}
      >
        <View
          style={{
            justifyContent: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 22,
              fontWeight: 'bold',
              letterSpacing: 1,
              marginLeft: 10,
            }}
          >
            Bus Stops
          </Text>
        </View>
      </View>
      {!isValidCoordinates ? (
        <Text style={styles.errorText}>
          Invalid destination coordinates provided.
        </Text>
      ) : hasPermission ? (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation?.latitude || parsedDestLat,
            longitude: currentLocation?.longitude || parsedDestLng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={Platform.OS !== 'web'} // Web 下忽略此属性
        >
          <Marker
            coordinate={{ latitude: parsedDestLat, longitude: parsedDestLng }}
            title="Destination Bus Stop"
            pinColor="blue"
          />
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="Your Location"
              pinColor="red"
            />
          )}
          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#0000FF"
              strokeWidth={3}
            />
          )}
        </MapView>
      ) : (
        <Text style={styles.errorText}>Waiting for location permission...</Text>
      )}
      <View style={styles.buttonContainer}>
        <Button
          title="Stop Tracking (Bus)"
          onPress={stopLocationTracking}
          disabled={arrived}
        />
        {arrived && <Text style={styles.arrivedText}>You have arrived!</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 50,
    fontSize: 18,
    color: 'red',
  },
  arrivedText: {
    marginTop: 10,
    fontSize: 16,
    color: 'green',
    fontWeight: 'bold',
  },
});

export default TrackingScreen;