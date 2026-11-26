/** One world, two projections. Never compute a second seating arrangement. */
export function complementaryCamera(source) {
  return {...source, target:{...source.target},screenOffset:{x:0,y:0},yaw:Math.atan2(Math.sin(source.yaw+Math.PI),Math.cos(source.yaw+Math.PI))};
}
export function sameSharedReplayBasis(a,b) {
  const normalize=s=>{const x=JSON.parse(s);delete x.height;delete x.focal;return JSON.stringify(x);};
  return normalize(a)===normalize(b);
}
