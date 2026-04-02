# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

WatcherRobotAPP is a React Native mobile application for controlling a robot via Bluetooth Low Energy (BLE). The app provides four main features: Bluetooth device connection, robot control, motion playback, and dance programming.

## Tech Stack

- **Framework**: React Native 0.84.1
- **Language**: TypeScript
- **State Management**: Redux Toolkit + React Redux
- **Navigation**: React Navigation (bottom tabs)
- **Bluetooth**: react-native-ble-plx
- **Storage**: @react-native-async-storage/async-storage

## Commands

```bash
# Start Metro bundler
npm start
# or
yarn start

# Run on Android
npm run android
yarn android

# Run on iOS
npm run ios
yarn ios

# Run tests
npm test
yarn test

# Lint code
npm run lint
yarn lint
```

## Architecture

### Directory Structure

```
src/
├── modules/           # Feature modules (self-contained)
│   ├── bluetooth/      # BLE functionality (services, hooks, store, components)
│   └── app-text/       # Text constants/localization
├── screens/            # Page components (connected to navigation)
├── navigation/         # Navigation configuration
└── types/              # Global TypeScript type definitions
```

### Module Pattern

Each feature module follows a consistent structure:
- `components/` - Reusable UI components
- `services/` - Business logic and API calls
- `store/` - Redux state management
- `hooks/` - Custom React hooks
- `types/` - TypeScript interfaces
- `config/` - Configuration files
- `constants/` - Static constants
- `screens/` - Screen components specific to this module
- `index.ts` - Public API exports

### Path Aliases

Use `@/` prefix for imports from `src/` directory:
```typescript
import { AppNavigator } from '@/navigation';
import { BluetoothPage } from '@/screens';
```

## Key Features

1. **Bluetooth Page** - Scan and connect to robot via BLE
2. **Control Page** - Manual joystick/directional control
3. **Motion Page** - Record and playback robot motions
4. **Dance Page** - Program dance sequences

## BLE Communication

The app uses `react-native-ble-plx` for Bluetooth Low Energy communication. The bluetooth module exposes:
- `useBluetooth` hook for BLE operations
- `bluetoothService` for device scanning/connecting
- Redux store for connection state management
