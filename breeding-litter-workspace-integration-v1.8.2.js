(function(root){
  "use strict";
  if(!root?.document)return;
  let queued=false;
  let observer=null;

  function loadWeaningSafeguards(){
    const target=root.document.head||root.document.documentElement;
    if(!root.document.getElementById("hh-weaning-safeguards-v182-style")){
      const style=root.document.createElement("link");
      style.id="hh-weaning-safeguards-v182-style";
      style.rel="stylesheet";
      style.href="weaning-safeguards-v1.8.2.css?v=1";
      target.appendChild(style);
    }
    function addScript(id,src,onload){
      const existing=root.document.getElementById(id);
      if(existing){onload?.();return;}
      const script=root.document.createElement("script");
      script.id=id;
      script.src=src;
      script.async=false;
      if(onload)script.addEventListener("load",onload,{once:true});
      target.appendChild(script);
    }
    addScript("hh-weaning-safeguards-core-v182","weaning-safeguards-core-v1.8.2.js?v=1",()=>{
      addScript("hh-weaning-safeguards-v182","weaning-safeguards-v1.8.2.js?v=1");
    });
  }

  function enhanceLifecycle(){
    root.document.querySelectorAll("#view-animal-profile .hh-p2-life-card").forEach(card=>{
      const actions=card.querySelector(".hh-p2-life-actions");
      if(!actions)return;
      const primary=actions.querySelector(":scope > button:first-child[data-litter-id]");
      if(!primary||primary.dataset.hhBwIntegrated==="1")return;
      const litterId=primary.dataset.litterId;
      if(!litterId)return;
      primary.dataset.hhBwIntegrated="1";
      primary.dataset.hhBwManageLitter=litterId;
      delete primary.dataset.hhP2LifeAction;
      primary.textContent="Manage litter";
    });
  }

  function enhanceLitterCards(){
    root.document.querySelectorAll("#view-litters .animal-card").forEach(card=>{
      const edit=card.querySelector("[data-edit-litter]");
      const litterId=edit?.dataset?.editLitter;
      if(!litterId)return;
      const create=card.querySelector("[data-create-offspring]");
      if(!create)return;
      const existing=card.querySelector("[data-hh-bw-manage-litter]");
      if(existing&&existing!==create){
        create.remove();
        return;
      }
      create.dataset.hhBwManageLitter=litterId;
      create.removeAttribute("data-create-offspring");
      create.textContent="Manage litter";
      create.classList.add("button-primary");
    });
  }

  function onOffspringCreated(event){
    const litterId=event?.detail?.litterId;
    if(!litterId)return;
    root.setTimeout?.(()=>root.HerdHarborBreedingWorkspace?.open?.(litterId),120);
  }

  function run(){queued=false;enhanceLifecycle();enhanceLitterCards();}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(run,0);}
  function install(){
    loadWeaningSafeguards();
    observer=new root.MutationObserver(schedule);
    if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});
    root.addEventListener?.("hashchange",schedule);
    root.addEventListener?.("herdharbor:litter-workspace-changed",schedule);
    root.addEventListener?.("herdharbor:offspring-auto-created",onOffspringCreated);
    schedule();
  }
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
