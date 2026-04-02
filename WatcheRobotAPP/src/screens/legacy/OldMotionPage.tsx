import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export const OldMotionPage: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Legacy Motion Page</Text>
    <Text style={styles.body}>
      This screen remains as a non-interactive placeholder for historical
      references only.
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
