declare module '@kninnug/constrainautor' {
  export default class Constrainautor {
    constructor(del: { coords: ArrayLike<number>; triangles: Uint32Array; halfedges: Int32Array }, edges?: [number, number][]);
  }
}
declare module 'opentype.js/dist/opentype.mjs' {
  export { parse, Font } from 'opentype.js';
}
