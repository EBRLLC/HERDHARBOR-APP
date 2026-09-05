(function(root){
'use strict';
const MODAL_ID='hh-health-intelligence-modal';
const BODY_CLASS='hh-hi-modal-open';
function currentModal(){return root.document?.getElementById(MODAL_ID)||null}
function unlockPage(){root.document?.body?.classList.remove(BODY_CLASS)}
function bringIntoView(modal=currentModal()){
  if(!modal)return null;
  const body=root.document?.body;
  body?.classList.add(BODY_CLASS);
  modal.scrollTop=0;
  const dialog=modal.querySelector?.('.hh-hi-modal');
  const content=modal.querySelector?.('.hh-hi-modal > .modal-content');
  if(content)content.scrollTop=0;
  if(dialog){
    if(!dialog.hasAttribute('tabindex'))dialog.setAttribute('tabindex','-1');
    const focusDialog=()=>{try{dialog.focus({preventScroll:true})}catch{try{dialog.focus()}catch{}}};
    if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(focusDialog);else root.setTimeout?.(focusDialog,0);
  }
  return modal;
}
function install(){
  if(!root.document?.body)return;
  if(currentModal())bringIntoView();
  const observer=typeof root.MutationObserver==='function'?new root.MutationObserver(()=>{
    const modal=currentModal();
    if(modal)bringIntoView(modal);else unlockPage();
  }):null;
  observer?.observe(root.document.body,{childList:true});
  root.document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-hi-action],[data-hi-assess]'))root.setTimeout?.(()=>bringIntoView(),0);
    if(event.target?.closest?.('[data-hi-close]'))root.setTimeout?.(()=>{if(!currentModal())unlockPage()},0);
  });
  root.document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const modal=currentModal();
    if(!modal)return;
    modal.remove();
    unlockPage();
  });
  root.addEventListener?.('pagehide',unlockPage);
}
const API=Object.freeze({bringIntoView,unlockPage,install});
root.HerdHarborHealthUiHotfix=API;
if(typeof module!=='undefined'&&module.exports)module.exports=API;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install()}
})(typeof globalThis!=='undefined'?globalThis:this);
