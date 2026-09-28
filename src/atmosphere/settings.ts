export interface AtmosphereSettings { enabled:boolean; paused:boolean }
export const DEFAULT_ATMOSPHERE:AtmosphereSettings={enabled:true,paused:false};
export function shouldAnimate(settings:AtmosphereSettings,reduced:boolean,visible:boolean){
  return settings.enabled&&!settings.paused&&!reduced&&visible;
}
