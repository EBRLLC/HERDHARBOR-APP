(function(root){
  "use strict";
  if(!root?.document)return;

  let Core=root.HerdHarborLifecycleIntegrityCore;
  let observer=null;
  let queued=false;
  let repairing=false;
  let retryCount=0;

  function stateNow(){
    try{return root.HerdHarborApp?.getState?.()||null;}catch{return null;}
  }

  function closeRemovedWorkspace(removedIds){
    if(!removedIds?.length)return;
    const overlay=root.document.getElementById("hh-breeding-litter-workspace");
    if(!overlay)return;
    try{root.HerdHarborBreedingWorkspace?.close?.();}catch{}
    overlay.remove?.();
    root.document.documentElement.classList.remove("hh-bw-open");
  }

  function repair(){
    queued=false;
    if(repairing)return;
    Core=root.HerdHarborLifecycleIntegrityCore||Core;
    const app=root.HerdHarborApp;
    const state=stateNow();
    if(!Core||!app?.commitState||!state){
      if(retryCount<12){retryCount+=1;root.setTimeout?.(schedule,350);}
      return;
    }
    retryCount=0;
    const result=Core.reconcile(state);
    if(!result.changed)return;

    repairing=true;
    try{
      const removed=result.removedLitterIds.length;
      const future=result.clearedFutureWeaningIds.length;
      let message=removed
        ? `${removed} stale litter workflow${removed===1?"":"s"} removed after linked breeding/birth deletion.`
        : "Stale livestock lifecycle links repaired.";
      if(future)message+=` ${future} invalid future weaning record${future===1?"":"s"} cleared.`;
      app.commitState(result.state,message);
      closeRemovedWorkspace(result.removedLitterIds);
      app.refresh?.();
      try{
        root.dispatchEvent?.(new root.CustomEvent("herdharbor:lifecycle-integrity-repaired",{detail:{
          removedLitterIds:result.removedLitterIds,
          unlinkedAnimalIds:result.unlinkedAnimalIds,
          unlinkedSaleIds:result.unlinkedSaleIds,
          clearedFutureWeaningIds:result.clearedFutureWeaningIds
        }}));
      }catch{}
    }finally{
      repairing=false;
    }
  }

  function schedule(){
    if(queued||repairing)return;
    queued=true;
    (root.requestAnimationFrame||root.setTimeout)(repair,0);
  }

  function scheduleAfterAction(){root.setTimeout?.(schedule,0);}

  function install(){
    observer=new root.MutationObserver(schedule);
    if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});
    root.addEventListener("click",scheduleAfterAction,true);
    root.addEventListener("submit",scheduleAfterAction,true);
    root.addEventListener("change",scheduleAfterAction,true);
    root.addEventListener("hashchange",schedule);
    root.addEventListener("storage",schedule);
    root.addEventListener("herdharbor:litter-workspace-changed",schedule);
    root.addEventListener("herdharbor:offspring-auto-created",schedule);
    schedule();
  }

  root.HerdHarborLifecycleIntegrity=Object.freeze({VERSION:"1.8.2",refresh:schedule});
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
