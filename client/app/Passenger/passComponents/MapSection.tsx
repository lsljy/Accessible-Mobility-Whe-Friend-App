import React, { useRef } from "react";
import { Platform, StyleSheet, View, Text } from "react-native";
import { Coordinates, BusStop } from "../../../src/types";

interface Props {
  fromCoords: Coordinates;
  toCoords?: Coordinates | null;
  nearbyStops: BusStop[];        // 保留 prop 但暂不使用，避免类型错误
  onStopPress: (stop: BusStop) => void;
  mapWrapperStyle?: object;
  mapStyle?: object;
  userLocation?: Coordinates | null;
  routeCoordinates?: Coordinates[];
}

const MapSection = ({
  fromCoords,
  toCoords,
  mapStyle,
  mapWrapperStyle,
  userLocation,
  routeCoordinates = [],
}: Props) => {
  const mapRef = useRef<any>(null);

  // Web 平台占位符
  if (Platform.OS === "web") {
    return (
      <View style={[styles.mapWrapper, mapWrapperStyle]}>
        <View style={[styles.map, styles.placeholderContainer, mapStyle]}>
          <Text style={styles.placeholderText}>🗺️ 地图功能仅在移动设备上可用</Text>
          <Text style={styles.placeholderSubtext}>
            请在 Android 或 iOS 设备上查看完整地图
          </Text>
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              起点: {fromCoords.latitude}, {fromCoords.longitude}
            </Text>
            {toCoords && (
              <Text style={styles.infoText}>
                终点: {toCoords.latitude}, {toCoords.longitude}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  // 移动端：动态导入地图组件
  const MapView = require("react-native-maps").default;
  const Marker = require("react-native-maps").Marker;
  const Polyline = require("react-native-maps").Polyline;
  const PROVIDER_GOOGLE = require("react-native-maps").PROVIDER_GOOGLE;

  return (
    <View style={[styles.mapWrapper, mapWrapperStyle]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={[styles.map, mapStyle]}
        initialRegion={{
          latitude: fromCoords.latitude,
          longitude: fromCoords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation={!!userLocation}
      >
        {/* 起点标记 */}
        <Marker coordinate={fromCoords} title="起点" pinColor="red" />

        {/* 终点标记 */}
        {toCoords && <Marker coordinate={toCoords} title="终点" pinColor="green" />}

        {/* 用户当前位置标记 */}
        {userLocation && (
          <Marker coordinate={userLocation} title="我的位置" pinColor="blue" />
        )}

        {/* 路线折线 */}
        {routeCoordinates && routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#0000FF"
            strokeWidth={3}
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  mapWrapper: {
    marginVertical: 15,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  map: {
    height: 400,
    width: "100%",
  },
  placeholderContainer: {
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    padding: 20,
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 20,
  },
  infoContainer: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    width: "100%",
  },
  infoText: {
    fontSize: 12,
    color: "#333",
    marginVertical: 2,
  },
});

export default MapSection;