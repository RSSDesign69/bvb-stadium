export interface AtmosphereSettings { enabled:boolean; paused:boolean; clearView:boolean }
export const DEFAULT_ATMOSPHERE:AtmosphereSettings={enabled:true,paused:false,clearView:true};
export function shouldAnimate(settings:AtmosphereSettings,reduced:boolean,visible:boolean,preview:boolean){
  return settings.enabled&&!settings.paused&&!reduced&&visible&&!(preview&&settings.clearView);
}
