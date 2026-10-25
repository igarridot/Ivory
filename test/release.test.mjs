import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRelease } from '../scripts/release-version.mjs';

test('the first public release starts at 0.1.0',()=>{
  assert.deepEqual(nextRelease(),{tag:'v0.1.0',version:'0.1.0',reused:false});
});
test('version ordering is numeric and unrelated tags do not affect releases',()=>{
  assert.equal(nextRelease({tags:['v0.1.9','v0.1.10','preview','v1.0.0-beta','v0.1.2']}).tag,'v0.1.11');
});
test('rerunning a release reuses the tag already pointing at the commit',()=>{
  assert.deepEqual(nextRelease({tags:['v0.1.0','v0.1.1'],headTags:['v0.1.0'],bump:'major'}),{tag:'v0.1.0',version:'0.1.0',reused:true});
});
test('manual releases can increment minor or major and invalid increments fail',()=>{
  assert.equal(nextRelease({tags:['v0.1.9'],bump:'minor'}).tag,'v0.2.0');
  assert.equal(nextRelease({tags:['v0.1.9'],bump:'major'}).tag,'v1.0.0');
  assert.throws(()=>nextRelease({bump:'bad'}),/no válido/);
});
