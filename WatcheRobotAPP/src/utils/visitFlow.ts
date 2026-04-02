// Nearby 页会用这两个场景区分“收到邀请”还是“收到访问请求”。
export type NearbyScenario = 'incomingInvite' | 'incomingVisit';

// Watcher 页收到场景参数后，会决定先弹请求确认框还是时长输入框。
export type WatcherScenario = 'visitDuration' | 'incomingRequest';

// 同一个请求弹窗会根据类型切换成 invite / visit 两套文案。
export type VisitRequestKind = 'invite' | 'visit';
