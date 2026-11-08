/** Bring a rendered error summary into view without changing validation or data. */
export function focusComposerErrors(element){
 if(!element||element.hidden||!element.textContent?.trim())return false;
 element.focus({preventScroll:true});
 element.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
 return true;
}
