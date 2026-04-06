// web-maps-mock.js - 用于 Web 环境的空组件
import React from 'react';
import { View, Text } from 'react-native';

export default function MockMapView(props) {
  return (
    <View style={props.style}>
      <Text>地图组件（Web 预览）</Text>
    </View>
  );
}

export const Marker = () => null;
export const Polyline = () => null;
export const PROVIDER_GOOGLE = null;
export const UrlTile = () => null;
export const LocalTile = () => null;
export const Callout = () => null;
export const Circle = () => null;