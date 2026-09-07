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

  function idSnapshot(state){
    return{
      breedings:Array.isArray(state?.breedings)?state.breedings.map(row=>({id:String(row.id)})):[],
      litters:Array.isArray(state?.litters)?state.litters.map(row=>({id:String(row.id)})):[]
    };
  }

  function closeRemovedWorkspace(removedIds){
    if(!removedIds?.length)return;
    const overlay=root.document.getElementById("hh-breeding-litter-workspace");
    if(!overlay)return;
    try{root.HerdHarborBreedingWorkspace?.close?.();}catch{}
    overlay.remove?.();
    root.document.documentElement.classList.remove("hh-bw-open");
  }

  function publish(result){
    try{
      root.dispatchEvent?.(new root.CustomEvent("herdharbor:lifecycle-integrity-repaired",{detail:{
        removedBreedingIds:result.removedBreedingIds||[],
        removedLitterIds:result.removedLitterIds||[],
        unlinkedLitterIds:result.unlinkedLitterIds||[],
        unlinkedAnimalIds:result.unlinkedAnimalIds||[],
        unlinkedSaleIds:result.unlinkedSaleIds||[],
        clearedFutureWeaningIds:result.clearedFutureWeaningIds||[],
        detectedStaleLitterIds:result.detectedStaleLitterIds||[]
      }}));
    }catch{}
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
      const removed=(result.removedLitterIds||[]).length;
      const unlinked=(result.unlinkedLitterIds||[]).length;
      const future=(result.clearedFutureWeaningIds||[]).length;
      let message=removed
        ? `${removed} deleted birth workflow${removed===1?"":"s"} cleaned up and protected from returning.`
        : unlinked
          ? `${unlinked} birth workflow${unlinked===1?" was":"s were"} detached from a deleted breeding record.`
          : "Livestock lifecycle links repaired.";
      if(future)message+=` ${future} invalid future weaning record${future===1?"":"s"} cleared.`;
      app.commitState(result.state,message);
      closeRemovedWorkspace(result.removedLitterIds);
      app.refresh?.();
      publish(result);
    }finally{
      repairing=false;
    }
  }

  function captureExplicitDeletion(before){
    Core=root.HerdHarborLifecycleIntegrityCore||Core;
    const app=root.HerdHarborApp;
    const after=stateNow();
    if(!Core||!app?.commitState||!after)return schedule();
    const marked=Core.recordDeletionTombstones(before,after);
    if(!marked.changed)return schedule();
    app.commitState(marked.state,"Deletion recorded and protected from stale cloud restoration.");
    app.refresh?.();
    schedule();
  }

  function onClickCapture(event){
    const deleteButton=event.target.closest?.("#delete-litter,#delete-breeding");
    if(deleteButton){
      const before=idSnapshot(stateNow());
      root.setTimeout?.(()=>captureExplicitDeletion(before),80);
    }
    root.setTimeout?.(schedule,0);
  }

  function schedule(){
    if(queued||repairing)return;
    queued=true;
    (root.requestAnimationFrame||root.setTimeout)(repair,0);
  }

  function install(){
    observer=new root.MutationObserver(schedule);
    if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});
    root.addEventListener("click",onClickCapture,true);
    root.addEventListener("submit",()=>root.setTimeout?.(schedule,0),true);
    root.addEventListener("change",()=>root.setTimeout?.(schedule,0),true);
    root.addEventListener("hashchange",schedule);
    root.addEventListener("storage",schedule);
    root.addEventListener("herdharbor:litter-workspace-changed",schedule);
    root.addEventListener("herdharbor:offspring-auto-created",schedule);
    root.document.addEventListener("herdharbor:sync-status",schedule);
    root.document.addEventListener("herdharbor:auth-session",schedule);
    schedule();
  }

  root.HerdHarborLifecycleIntegrity=Object.freeze({VERSION:"1.8.2",refresh:schedule});
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
