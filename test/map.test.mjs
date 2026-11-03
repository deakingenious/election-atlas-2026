import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const fn=app.slice(app.indexOf('function parseMapTopology('),app.indexOf('function mapSvg(){'));
const parse=runInNewContext(`${fn}; parseMapTopology`);
test('state TopoJSON converts to projected paths',()=>{
 const names=Object.fromEntries(Array.from({length:50},(_,i)=>[`S${i}`,`State ${i}`]));
 const topology={type:'Topology',transform:{scale:[2,3],translate:[10,20]},arcs:[[[0,0],[3,0],[0,4],[-3,0],[0,-4]]],objects:{states:{geometries:Array.from({length:50},(_,i)=>({type:'Polygon',properties:{name:`State ${i}`},arcs:[[0]]}))}}};
 const shapes=parse(topology,names);
 assert.equal(shapes.length,50);
 assert.equal(shapes[0].code,'S0');
 assert.equal(shapes[0].d,'M10.00,20.00L16.00,20.00L16.00,32.00L10.00,32.00L10.00,20.00Z');
});
test('invalid topologies fail visibly',()=>assert.throws(()=>parse({type:'GeometryCollection'},{}),/Invalid U.S. map topology/));
