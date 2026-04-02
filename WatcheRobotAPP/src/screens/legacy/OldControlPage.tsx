import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export const OldControlPage: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Legacy Control Page</Text>
    <Text style={styles.body}>
      This screen is kept only as a compatibility placeholder while the BLE
      stack uses the JSON protocol implementation.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F5F9',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0D0D0D',
  },
  body: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: '#636A74',
  },
});
