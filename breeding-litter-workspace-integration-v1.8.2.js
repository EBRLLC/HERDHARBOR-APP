(function(root){
  "use strict";
  if(!root?.document)return;
  let queued=false;
  let observer=null;

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
      if(create){
        create.dataset.hhBwManageLitter=litterId;
        create.removeAttribute("data-create-offspring");
        create.textContent="Manage litter";
        create.classList.add("button-primary");
      }
    });
  }

  function run(){queued=false;enhanceLifecycle();enhanceLitterCards();}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(run,0);}
  function install(){
    observer=new root.MutationObserver(schedule);
    if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});
    root.addEventListener?.("hashchange",schedule);
    root.addEventListener?.("herdharbor:litter-workspace-changed",schedule);
    schedule();
  }
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
