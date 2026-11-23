import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {eventGeometry,mapRecords,featureBounds,eventMapStyle,mapSettings,DEFAULT_MAP} from '../web/map-model.mjs';
import {comparison,filterRows} from '../web/model.mjs';
const index=JSON.parse(fs.readFileSync(new URL('../web/data/index.json',import.meta.url)));
const capture=JSON.parse(fs.readFileSync(new URL('../web/data/'+index.captures[0].file,import.meta.url)));
test('retains all source line vertices in longitude/latitude order',()=>{
 const event=capture.events.find(e=>e.geography?.type==='LineString');assert.ok(event);
 const geometry=eventGeometry(event);assert.equal(geometry.type,'LineString');assert.deepEqual(geometry.coordinates,event.geography.coordinates.map(p=>p.slice(0,2)));
 geometry.coordinates[0][0]=0;assert.notEqual(event.geography.coordinates[0][0],0);
});
test('accepts source points but does not derive points from road names',()=>{
 assert.deepEqual(eventGeometry({geography:{type:'Point',coordinates:[-123,49,100]}}),{type:'Point',coordinates:[-123,49]});
 assert.equal(eventGeometry({roads:[{name:'Highway 1'}]}),null);
});
test('rejects malformed lines as a whole without inventing a segment',()=>{
 for(const coordinates of [[[-123,49]], [[-123,49],['-122',50]], [[-123,49],[-122,91]], [[-123,49],[NaN,50]]]) assert.equal(eventGeometry({geography:{type:'LineString',coordinates}}),null);
 assert.equal(eventGeometry({geography:{type:'Polygon',coordinates:[]}}),null);
 assert.equal(eventGeometry({geography:{type:'Point',coordinates:[181,49]}}),null);
});
test('map exactly follows filtered event IDs, including events beyond list pagination',()=>{
 const rows=comparison(capture,null).rows;
 const filtered=filterRows(rows,{severity:'MAJOR'});
 assert.deepEqual(mapRecords(filtered).features.map(f=>f.id),filtered.filter(r=>eventGeometry(r.event)).map(r=>r.event.id));
 const all=mapRecords(rows);assert.equal(all.count+all.omitted.length,rows.length);assert.ok(all.count>50);
 assert.equal(mapRecords(filterRows(rows,{query:'not a real location 92874938'})).count,0);
});
test('omitted geometry remains accounted for without changing the record',()=>{
 const row={event:{id:'drivebc.ca/test',geography:{type:'LineString',coordinates:[[0,0],[null,2]]}},change:'unchanged'};
 assert.deepEqual(mapRecords([row]),{features:[],omitted:['drivebc.ca/test'],count:0});assert.equal(row.event.geography.coordinates.length,2);
});
test('bounds include every point of a winding line, not only its endpoints',()=>{
 assert.deepEqual(featureBounds([{geometry:{type:'LineString',coordinates:[[-123,49],[-130,56],[-122,48]]}},{geometry:{type:'Point',coordinates:[-120,51]}}]),[[48,-130],[56,-120]]);
 assert.equal(featureBounds([]),null);
});
test('absent records retain their original geometry and use a distinct uncertain style',()=>{
 const before={...capture,capturedAt:'2026-01-01T00:00:00Z',events:capture.events.slice(0,2)};
 const after={...before,capturedAt:'2026-01-02T00:00:00Z',events:before.events.slice(1)};
 const absent=comparison(after,before).rows.find(r=>r.change==='absent');const mapped=mapRecords([absent]);
 assert.equal(mapped.features[0].properties.change,'absent');assert.deepEqual(mapped.features[0].geometry,eventGeometry(before.events[0]));assert.equal(eventMapStyle(absent).dashArray,'6 5');
 assert.notEqual(eventMapStyle(absent).color,eventMapStyle(absent,true).color);
});
test('tile configuration requires HTTPS, attribution and bounded zoom',()=>{
 assert.equal(mapSettings().tileUrl,DEFAULT_MAP.tileUrl);assert.equal(mapSettings({tileUrl:''}).tileUrl,'');
 assert.throws(()=>mapSettings({tileUrl:'http://tile.openstreetmap.org/{z}/{x}/{y}.png'}));
 assert.throws(()=>mapSettings({tileUrl:'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'}));
 assert.throws(()=>mapSettings({attributionText:''}));assert.throws(()=>mapSettings({initialCenter:[999,0]}));assert.throws(()=>mapSettings({maxZoom:30}));
 const custom=mapSettings({tileUrl:'https://maps.example.org/tiles/{z}/{x}/{y}.png',attributionText:'Example maps',attributionUrl:'https://maps.example.org/license',maxZoom:10});
 assert.equal(custom.fitMaxZoom,10);
});
