"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const pedigree=require("../herdharbor-pedigree-platform.js");

const near=(actual,expected,eps=1e-12)=>assert.ok(Math.abs(actual-expected)<=eps,actual+" != "+expected);
const A=(id,sireId="",damId="")=>({id,name:id,sireId,damId});

test("verified fixture: unrelated animals have zero relationship and offspring Pedigree COI",()=>{
 const result=pedigree.calculatePedigreeRelationship({animals:[A("a"),A("b")],leftId:"a",rightId:"b",generations:3});
 near(result.relationshipCoefficient,0);
 near(result.projectedOffspringPedigreeCoi,0);
});

test("verified fixture: parent by offspring is R 0.5 and projected offspring F 0.25",()=>{
 const animals=[A("p"),A("q"),A("child","p","q")];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"p",rightId:"child",generations:3});
 near(result.relationshipCoefficient,0.5);
 near(result.projectedOffspringPedigreeCoi,0.25);
});

test("verified fixture: full siblings are R 0.5 and projected offspring F 0.25",()=>{
 const animals=[A("s"),A("d"),A("a","s","d"),A("b","s","d")];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:3});
 near(result.relationshipCoefficient,0.5);
 near(result.projectedOffspringPedigreeCoi,0.25);
});

test("verified fixture: half siblings are R 0.25 and projected offspring F 0.125",()=>{
 const animals=[A("shared"),A("x"),A("y"),A("a","shared","x"),A("b","shared","y")];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:3});
 near(result.relationshipCoefficient,0.25);
 near(result.projectedOffspringPedigreeCoi,0.125);
});

test("verified fixture: first cousins are R 0.125 and projected offspring F 0.0625",()=>{
 const animals=[
  A("g1"),A("g2"),A("p1","g1","g2"),A("p2","g1","g2"),
  A("u1"),A("u2"),A("a","p1","u1"),A("b","p2","u2")
 ];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:4});
 near(result.relationshipCoefficient,0.125);
 near(result.projectedOffspringPedigreeCoi,0.0625);
});

test("verified fixture: repeated ancestors through both grandparents accumulate correctly",()=>{
 const animals=[
  A("g1"),A("g2"),A("p1","g1","g2"),A("p2","g1","g2"),
  A("p3","g1","g2"),A("p4","g1","g2"),
  A("a","p1","p2"),A("b","p3","p4")
 ];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:4});
 near(result.relationshipCoefficient,0.5);
 near(result.projectedOffspringPedigreeCoi,0.25);
 assert.ok(result.sharedAncestorCount>=2);
});

test("verified fixture: an inbred shared parent increases half-sibling relationship",()=>{
 const animals=[
  A("g1"),A("g2"),A("sib1","g1","g2"),A("sib2","g1","g2"),
  A("inbredParent","sib1","sib2"),A("u1"),A("u2"),
  A("a","inbredParent","u1"),A("b","inbredParent","u2")
 ];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:5});
 near(result.leftPedigreeCoi,0);
 near(result.relationshipCoefficient,0.3125);
 near(result.projectedOffspringPedigreeCoi,0.15625);
 assert.ok(result.sharedAncestorContributions.some((entry)=>entry.identityId==="inbredParent" && Math.abs(entry.ancestorInbreeding-0.25)<1e-12));
});

test("incomplete pedigrees calculate only from known ancestry and report limited coverage",()=>{
 const animals=[A("shared"),A("a","shared",""),A("b","shared","")];
 const result=pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:4});
 near(result.relationshipCoefficient,0.25);
 near(result.projectedOffspringPedigreeCoi,0.125);
 assert.equal(result.incompletePedigree,true);
 assert.ok(result.pedigreeCompleteness.left.percent<100);
});

test("circular pedigrees are rejected instead of producing plausible-looking coefficients",()=>{
 const animals=[A("a","b",""),A("b","a","")];
 assert.throws(()=>pedigree.calculatePedigreeRelationship({animals,leftId:"a",rightId:"b",generations:5}),/Circular pedigree/);
});
