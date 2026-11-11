/** A saved idea can start a new draft. No input is borrowed from an open editor. */
export function createIdeaReuse({getContext,save,setBusy,onSaved,onFailure,notify}){
  let pending=false,locked=false;
  const signature=context=>JSON.stringify({state:context.state,view:context.view,query:context.query,ideaTag:context.ideaTag,navigation:context.navigation});
  function available(){const context=getContext();return !pending&&!locked&&!context.busy&&context.view==='ideas'&&context.state.posts.length<100;}
  return {
    get pending(){return pending;},
    get locked(){return locked;},
    available,
    async run(postId){
      if(!available())return false;
      const context=getContext();if(!context.state.posts.some(post=>post.id===postId&&post.status==='idea'))return false;
      const before=signature(context);let result;
      pending=true;setBusy(true);
      try{result=await save(context.state,{postId});}
      catch(error){locked=true;onFailure?.();notify(error?.message||'Speicherstatus unklar. Neu laden und Entwürfe prüfen.');return false;}
      finally{pending=false;setBusy(false);}
      // The commit is complete. New navigation or input must not be replaced.
      const current=getContext(),open=!current.busy&&before===signature(current);
      try{onSaved(result,{open});notify('Neuer Entwurf gespeichert. Die Idee bleibt erhalten.');}
      catch{locked=true;notify('Neuer Entwurf gespeichert. Ansicht neu laden.');}
      return true;
    }
  };
}
