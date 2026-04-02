import type {ImageSourcePropType} from 'react-native';

export type WatcherActionItem = {
  id: string;
  title: string;
  imageSource: ImageSourcePropType;
  protocolStatus: string;
  actionFile: string;
  message: string;
};

export const WATCHER_ACTION_ITEMS: WatcherActionItem[] = [
  {
    id: 'error',
    title: 'error',
    imageSource: require('../../assets/images/dance/20260401-171539.webp'),
    protocolStatus: 'error',
    actionFile: 'error',
    message: 'error',
  },
  {
    id: 'happy',
    title: 'happy',
    imageSource: require('../../assets/images/dance/20260401-171543.webp'),
    protocolStatus: 'happy',
    actionFile: 'happy',
    message: 'happy',
  },
  {
    id: 'custom3',
    title: 'custom3',
    imageSource: require('../../assets/images/dance/20260401-171547.webp'),
    protocolStatus: 'custom3',
    actionFile: 'custom3',
    message: 'custom3',
  },
  {
    id: 'thinking',
    title: 'thinking',
    imageSource: require('../../assets/images/dance/20260401-171551.webp'),
    protocolStatus: 'thinking',
    actionFile: 'thinking',
    message: 'thinking',
  },
  {
    id: 'standby',
    title: 'standby',
    imageSource: require('../../assets/images/dance/20260401-171523.webp'),
    protocolStatus: 'standby',
    actionFile: 'standby',
    message: 'standby',
  },
  {
    id: 'speaking',
    title: 'speaking',
    imageSource: require('../../assets/images/dance/20260401-171535.webp'),
    protocolStatus: 'speaking',
    actionFile: 'speaking',
    message: 'speaking',
  },
];

export const toAiStatusPayload = (item: WatcherActionItem) => ({
  status: item.protocolStatus,
  actionFile: item.actionFile,
  message: item.message,
});
