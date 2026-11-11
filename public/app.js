import {renderDraftGroups,restoreDraftCardFocus} from './draft-groups.js';
import {createIdeaReuse} from './idea-reuse.js';
import {captureWorkspaceChannelMedia,projectWorkspaceChannelMedia} from './workspace-channel-media.js';
import {channelMediaEligible} from './channel-media.js';
import {createChannelMediaUI} from './channel-media-ui.js';
import { createOriginalPreservation } from './preserve-video-original.js';
import {createVideoTailEditor} from './video-tail-editor-router.js';
import {isVideoMedia,prepareComposerVideo,createVideoPreviewURLs} from './composer-video.js';
import {installComposerFileDrop} from './composer-file-drop.js';
import {prepareImageBatch} from './composer-image-batch.js';
import {createComposerMedia} from './composer-media.js';
import {copySavedImage} from './saved-alt-copy.js';
import {createDraftLabelsUI} from './draft-labels-ui.js';
import {createDraftReplaceUI} from './draft-replace-ui.js';
import {createReturnDraftsUI} from './return-drafts-ui.js';
import {savedTextCatalog,resolveSavedText,insertSavedText} from './saved-texts.js';
import {createSavedTextPicker} from './saved-text-picker.js';
import {createPostTemplatePicker} from './post-template-picker.js';
import {createDraftBatchUI} from './draft-batch-ui.js';
import {createArchiveDraftsUI} from './archive-drafts-ui.js';
import {createDateShiftUI} from './date-shift-ui.js';
import {createQueueSwapUI} from './queue-swap-ui.js';
import {createQueuePriorityUI} from './queue-priority-ui.js';
import {createQueueReflowUI} from './queue-reflow-ui.js';
import {splitDraftEligible,prepareDraftSplit,draftSplitMatches} from './channel-draft-split.js';
import {createCalendarRescheduler} from './calendar-reschedule-ui.js';
import {savedImageCatalog,resolveSavedImage,decodeSavedImage} from './saved-images.js';
import {createSavedImagePicker} from './saved-image-picker.js';
import {installPlanningClock,planningClockKey} from './planning-clock.js';
import {renderChannelTextReview} from './channel-text-review.js';
import {renderPlanningGuidance,renderPlanningHint} from './planning-guidance.js';
import {renderChannelQueue,channelQueue,queueCalendarDay,queuePriorityAvailable,QUEUE_STATUSES} from './channel-queue.js';
import {createImageStudio} from './image-studio.js';
import {installVisualEditor,updateVisualPresentation} from './visual-editor.js';
import {renderHomeOverview} from './home-overview.js';
import {createPlannerImportUI} from './planner-import-ui.js';
import {handoffReference,savedMastodonText} from './mastodon-handoff.js';
import {focusComposerErrors} from './composer-feedback.js';
import { calendarPosts, calendarTime, planningStatus, periodSummary } from './calendar-model.js';
import {refreshMastodonPlanningStatus,clearMastodonPlanningStatus} from './mastodon-planning.js';
import {createWorkspaceUI} from './workspace-ui.js';
import {workspaceRestoreDecision,workspaceRestoreMedia} from './workspace-restore.js';
import { postLabelOptions, editedPostLabels, imageAltIsReadOnly } from './post-labels.js';
import { createConnectionsPanel } from './connections.js';
import { parseIdeaTags, formatIdeaTags, createIdea, updateIdea, prepareIdeaDraft, commitIdeaDraft, filterIdeas } from './workflows/ideas.mjs';
import { validateIdea, ideaTitle } from './ideas.js';
import { createSavedQueuePanel } from './saved-queue-panel.js';
import { createPostingTimesUI } from './posting-times-ui.js';
import { createEditorTiming } from './editor-timing.js';
import { inspectScheduleBinding } from './workflows/posting-schedules.mjs';
import { duplicateTaktDraft } from './workflows/queue.mjs';
import { effectiveText, hasTextVariant, selectedVariantTexts, variantCount, inheritedChannels } from './variants.js';
import { CHANNELS, dateKey, addDays, startOfWeek, localDateTime, displayTitle, characterCount, validatePost, filterPosts, normalizeState, defaultTimeZone, zonedNow, isTimeZone } from './model.js';
import { browserStore, loadInitialState } from './store.js';
const icons={mastodon:'<path d="M5 18V8a7 7 0 0 1 14 0v7c-4 3-10 3-14 1M8 13V8a2 2 0 0 1 4 0v4M12 8a2 2 0 0 1 4 0v5M5 16c0 5 4 6 9 5"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',layers:'<path d="m12 3-9 5 9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',settings:'<path d="m9 3-1 3-3 1 1 4-2 2 3 3v3l4 1 2-2 3 1 3-3-1-3 2-2-1-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',sparkles:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM19 2v4M17 4h4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.4 2.4 0 1 1 4.5 1.2c-.8 1-2.1 1.1-2.1 2.8M12 17h.01"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.4 2.4 4.6-4.6"/>',list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',filter:'<path d="M4 6h16M7 12h10M10 18h4"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>','chevron-left':'<path d="m14 6-6 6 6 6"/>','chevron-right':'<path d="m10 6 6 6-6 6"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',message:'<path d="M21 11.5A8.5 8.5 0 0 1 12.5 20a9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/>',send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',bookmark:'<path d="M6 3h12v19l-6-4-6 4V3Z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>','check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',linkedin:'<path d="M6 9v10M6 5v.01M11 19V9h4a4 4 0 0 1 4 4v6M11 13a4 4 0 0 1 4-4"/>',bluesky:'<path d="M12 11C8 4 2 2 3 9c.5 3 3 4 5 4-7 1-5 7-1 6 2-.5 4-3 5-5 1 2 3 4.5 5 5 4 1 6-5-1-6 2 0 4.5-1 5-4 1-7-5-5-9 2Z"/>'};
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.file}</svg>`;
const hydrateIcons=(root=document)=>root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const platform=(id,size='')=>{const c=CHANNELS.find(c=>c.id===id);return c?`<span class="platform-icon ${size}" style="--platform-color:${c.color}" title="${esc(c.name)}" aria-label="${esc(c.name)}">${icon(id)}</span>`:''};
const stack=channels=>`<span class="platform-stack">${channels.map(id=>platform(id,'small')).join('')}</span>`;
const days=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const dateLabel=(date,options={})=>new Date(date).toLocaleDateString('de-DE',options);
const videoPreviewURLs=createVideoPreviewURLs();
let videoSelectionController=null,videoWorkspaceVersion=2;
let composerChannelMedia=null,channelMediaUI=null,channelPreviewIndex={},channelMediaFenced=false;
const mediaSource=media=>(isVideoMedia(media)&&media?.dataUrl?videoPreviewURLs.source(media):media?.dataUrl)||(media?.url&&/^\/api\/planner\/media\/[A-Za-z0-9_-]+$/.test(media.url)?media.url:null);
const config=window.TaktConfig||{};
const store=window.TaktStore||browserStore;
let plannerLoaded=false;const homeExpanded=new Set();
const composerImages=createComposerMedia();
let imageStudioTicket=null;
let mediaBatchGeneration=null;
let draftGrouping='none';
let state,view='home',range='week',anchor=startOfWeek(addDays(new Date(),7)),channel='all',query='',editingId=null,composerMedia=null,composerCover=null,initialEditor='',toastTimer,undoAction=null,saving=false,returnFocus=null,localFallback=false,composerBaseText='',composerVariantTexts={},activeTextTarget='base',composerGeneration=0,mediaGeneration=0,mediaLoading=false;
const composerTiming=createEditorTiming();
let postingTimesUI=null;
let plannerImportUI=null;
let archiveDraftsUI=null;let draftBatchUI=null;let draftLabelsUI=null;let draftReplaceUI=null;
let returnDraftsUI=null;
let calendarStatus='all';
let queueStatus='planned';
let queueSwapUI=null;
let dateShiftUI=null;
let queuePriorityUI=null;
let queueReflowUI=null;
let queueCalendarReturnDay=null;
let queuePanel=null,workspaceUI=null,workspaceRestoring=false,workspacePlannerReading=false,composerRestoredWorkspace=false,composerMissingMedia=false,composerLabelState=null;
let savedAltEdit=null;
let imageStudioTarget=null,imageStudioGeneration=0;
let savedImagePicker=null,savedImageTarget=null;
let savedTextPicker=null,savedTextTarget=null,postTemplatePicker=null;
let splitPreview=null,splitToken=0,splitPending=false,splitNeedsReload=false,composerSavedRevision=null;
const composerFileDrop=installComposerFileDrop({dialog:$('#composer'),indicator:$('#composer-file-drop'),count:()=>composerImages.length,readBatch:readMediaBatch,status:$('#composer-file-drop-error'),canAccept:()=>(typeof composerChannelMedia==='undefined'||!composerChannelMedia)&&(typeof channelMediaUI==='undefined'||!channelMediaUI?.isOpen)&&!saving&&!mediaLoading&&!savedAltEdit&&!workspaceRestoring&&!workspacePlannerReading&&!splitPending&&!splitNeedsReload});
const imageStudio=createImageStudio({isBusy:()=>saving||mediaLoading,onApply:applyEditedImage,carousel:{snapshot:imageStudioSnapshot,select:selectStudioImage},fallbackFocus:()=>{if($('#composer').open)($('#media-alt')||$('#add-media')).focus();}});
let videoTailTarget=null;
const videoTailEditor=createVideoTailEditor({onApply:applyVideoTail,onBusy:busy=>{mediaLoading=busy;updateSaveAvailability();updateDraftSplitAvailability();}});

const connectionsPanel=createConnectionsPanel({container:document.querySelector('#connections-panel')});
let ideaReuseUI=null,ideaReuseNavigation=0;
let editingIdeaId=null,initialIdeaEditor='',ideaReturnFocus=null,ideaTag='',postTag='',composerIdeaFingerprint=null;
const disabledDuringCommit=new Map();
function updateSaveAvailability(){for(const selector of ['#save-draft','#schedule-post'])$(selector).disabled=saving||mediaLoading||!!savedAltEdit;}
function setComposerBusy(busy){if(busy){savedTextPicker?.close({restoreFocus:false});postTemplatePicker?.close({restoreFocus:false});}if($('#workspace-status'))$('#workspace-status').inert=busy;const form=$('#composer-form');form.setAttribute('aria-busy',String(busy));if(busy){for(const control of $$('#composer-form button, #composer-form input, #composer-form textarea, #composer-form select')){disabledDuringCommit.set(control,control.disabled);control.disabled=true;}}else{for(const [control,disabled] of disabledDuringCommit)control.disabled=disabled;disabledDuringCommit.clear();updateSaveAvailability();}}
function currentZone(){return state?.settings?.timezone||config.timezone||defaultTimeZone()}
function cover(post,extra='',playable=false){const items=post.channelMediaItems?.[typeof channel!=='undefined'&&channel!=='all'?channel:post.channels?.[0]]||post.mediaItems||[],first=items[0];const src=mediaSource(first);if(src&&isVideoMedia(first)&&!playable)return `<div class="cover ${extra}" role="img" aria-label="${esc(first.alt||first.name)}"><span class="video-card-label">▶ Video · ${esc(first.name)}</span></div>`;if(src&&isVideoMedia(first))return `<div class="cover ${extra}"><video class="cover-image" src="${esc(src)}" controls playsinline preload="metadata" aria-label="${esc(first.alt||first.name)}"></video></div>`;if(src)return `<div class="cover ${extra}"><img class="cover-image" src="${esc(src)}" alt="${esc(first.alt)}" loading="lazy">${items.length>1?`<span class="media-count">${items.length} Bilder</span>`:''}</div>`;return post.cover&&!post.channelMediaItems?`<div class="cover cover-${post.cover} ${extra}" role="img" aria-label="Abstrakte Demo-Illustration"></div>`:''}
function scheduleNeedsReview(post){return !!post.scheduleBinding&&inspectScheduleBinding(post,state.channels).state==='needs_review';}
function badge(post){const status=planningStatus(post,{needsReview:scheduleNeedsReview(post)});return `<span class="status ${status.kind}" title="Planungsstatus · kein Veröffentlichungsnachweis">${status.label}</span>`}
function shownTime(post){return post.calendarTime||calendarTime(post,currentZone())}
function calendarContext(post){const t=shownTime(post);return t&&t.sourceZone!==currentZone()?`<span class="calendar-source-time">Original: ${esc(t.sourceLocal.slice(0,10))} · ${esc(t.sourceLocal.slice(11))} ${esc(t.sourceZone)}</span>`:''}
function renderCalendarSummary(posts){const p=visiblePeriod(),summary=periodSummary(posts,dateKey(p.start),dateKey(p.end));return `<div class="calendar-brief"><div><p><strong>${summary.count} ${summary.count===1?'Beitrag':'Beiträge'}</strong> · ${summary.days} ${summary.days===1?'Tag':'Tage'} belegt · ${summary.channels} ${summary.channels===1?'Kanal':'Kanäle'}</p></div><button type="button" class="button subtle" data-action="date-shift">Termine gemeinsam verschieben</button><span class="calendar-safe">${icon('shield')}Keine automatische Veröffentlichung.</span></div>`}
function postLabelDescription(post){return `${scheduleNeedsReview(post)?', Termin prüfen':''}${post.tags?.length?`, Labels: ${post.tags.join(', ')}`:''}`}
function postLabels(post){const tags=post.tags||[];return tags.length?`<span class="post-labels" aria-label="Redaktionelle Labels: ${esc(tags.join(', '))}">${tags.slice(0,2).map(tag=>`<span title="${esc(tag)}">${esc(tag)}</span>`).join('')}${tags.length>2?`<span>+${tags.length-2}</span>`:''}</span>`:''}
function postCard(post,occurrence=null){const original=post.status==='draft'&&isPreservedOriginalCopy(post.id),title=post.status==='draft'&&post.title?.trim();return `${view==='calendar'?'<div class="calendar-post-wrap">':''}<button class="post-card" data-post-id="${esc(post.id)}" ${typeof occurrence==='string'?`data-draft-occurrence="${esc(occurrence)}" `:''}${view==='calendar'?`draggable="true" data-calendar-post="${esc(post.id)}"`: ''} aria-label="${title?esc(title)+', ':''}${original?'Original-Entwurf, ':''}${esc(displayTitle(post))}, ${post.status==='draft'?'Entwurf':`geplant ${shownTime(post)?.local.slice(11,16)} Uhr, ${currentZone()}`}${esc(postLabelDescription(post))}"><div class="post-card-head"><span class="post-time" title="${esc(currentZone())}">${icon(post.status==='draft'?'file':'clock')}${post.status==='draft'?'Entwurf':esc(shownTime(post)?.local.slice(11,16))}</span>${post.status==='draft'&&!post.channels.length?'<span class="draft-continue">Ohne Kanal</span>':stack(post.channels)}</div>${cover(post)}${title?`<strong class="post-card-title">${esc(title)}</strong>`:''}${original?'<span class="original-draft-badge">Original-Entwurf</span>':''}<p class="post-card-text">${esc(channel==='all'?post.text:effectiveText(post,channel))}</p>${calendarContext(post)}${postLabels(post)}<div class="post-card-footer">${badge(post)}${variantCount(post)?`<span class="variant-count" title="${variantCount(post)} individuelle Kanaltexte">${icon('layers')}${variantCount(post)}</span>`:''}${post.status==='draft'?'<span class="draft-continue">Weiterbearbeiten →</span>':'<span aria-hidden="true">•••</span>'}</div></button>${view==='calendar'?`<button type="button" class="calendar-reschedule" data-reschedule-post="${esc(post.id)}" aria-label="${esc(displayTitle(post))} verschieben">Verschieben</button></div>`:''}`}
function relevantPosts(){return calendarPosts(filterPosts(state.posts,{channel,query,tag:postTag,status:view==='drafts'?'draft':'scheduled'}),currentZone()).filter(p=>view==='drafts'||calendarStatus==='all'||planningStatus(p,{needsReview:scheduleNeedsReview(p)}).kind===calendarStatus)}
function visiblePeriod(){if(range==='month'){const start=new Date(anchor.getFullYear(),anchor.getMonth(),1);return {start,end:new Date(anchor.getFullYear(),anchor.getMonth()+1,0)}}return {start:startOfWeek(anchor),end:addDays(startOfWeek(anchor),6)}}
function periodPosts(posts){const p=visiblePeriod();return posts.filter(x=>x.calendarTime&&x.calendarTime.local.slice(0,10)>=dateKey(p.start)&&x.calendarTime.local.slice(0,10)<=dateKey(p.end))}
function emptyState(title,description,action='new-post',label='Beitrag erstellen'){return `<div class="empty-state"><div class="empty-icon">${icon(query||channel!=='all'||postTag!==''||((view==='calendar'||view==='list')&&calendarStatus!=='all')?'search':'sparkles')}</div><h3>${title}</h3><p>${description}</p><button class="button primary" data-action="${action}">${icon('plus')}${label}</button></div>`}
function renderWeek(posts){const start=startOfWeek(anchor);const today=dateKey(zonedNow(currentZone()));const cols=Array.from({length:7},(_,i)=>{const day=addDays(start,i),key=dateKey(day);const selected=posts.filter(p=>p.calendarTime?.local.startsWith(key));return `<section class="day-column ${i>4?'weekend':''} ${key===today?'is-today':''}" aria-label="${dateLabel(day,{weekday:'long',day:'numeric',month:'long'})}" data-calendar-day="${key}"><div class="day-heading"><span class="day-name">${days[i].slice(0,2).toUpperCase()}</span><span class="day-number">${day.getDate()}</span></div><div class="day-cards">${selected.map(postCard).join('')}<button class="add-day ${!selected.length?'empty-day':''}" data-new-date="${key}" aria-label="Beitrag für ${dateLabel(day,{day:'numeric',month:'long'})} erstellen">${icon('plus')}${!selected.length?'<span>Beitrag planen</span>':''}</button></div></section>`}).join('');return `<div class="week-grid desktop-week">${cols}</div><div class="mobile-agenda">${renderMobileWeek(periodPosts(posts),start)}</div>`}
function renderMobileWeek(posts,start){return Array.from({length:7},(_,i)=>{const day=addDays(start,i),key=dateKey(day),entries=posts.filter(p=>p.calendarTime?.local.startsWith(key));return `<section class="mobile-plan-day"><div class="mobile-plan-heading"><h3>${dateLabel(day,{weekday:'short',day:'numeric',month:'short'})}${key===dateKey(zonedNow(currentZone()))?' <span>Heute</span>':''}</h3><button class="icon-button" data-new-date="${key}" aria-label="Beitrag für ${dateLabel(day,{day:'numeric',month:'long'})} erstellen">${icon('plus')}</button></div>${entries.length?entries.map(postCard).join(''):'<p class="mobile-open-day">Noch frei</p>'}</section>`}).join('')}
function renderMonth(posts){const monthStart=new Date(anchor.getFullYear(),anchor.getMonth(),1),start=startOfWeek(monthStart);const monthEnd=new Date(anchor.getFullYear(),anchor.getMonth()+1,0);const cells=Math.ceil((((monthStart.getDay()+6)%7)+monthEnd.getDate())/7)*7;const today=dateKey(zonedNow(currentZone()));return `<div class="desktop-month"><div class="month-grid" aria-label="Monatsübersicht">${days.map(d=>`<div class="month-weekday">${d.slice(0,2)}</div>`).join('')}${Array.from({length:cells},(_,i)=>{const day=addDays(start,i),key=dateKey(day),entries=posts.filter(p=>p.calendarTime?.local.startsWith(key));return `<section class="month-cell ${day.getMonth()!==anchor.getMonth()?'muted':''} ${key===today?'is-today':''}" aria-label="${dateLabel(day,{day:'numeric',month:'long'})}" data-calendar-day="${key}"><span class="month-day-number">${day.getDate()}</span><button class="icon-button month-add" data-new-date="${key}" aria-label="Beitrag für ${dateLabel(day,{day:'numeric',month:'long'})} erstellen">${icon('plus')}</button>${entries.map(p=>`<div class="calendar-post-wrap month-post-wrap"><button class="month-post" draggable="true" data-calendar-post="${esc(p.id)}" data-post-id="${esc(p.id)}" aria-label="${esc(displayTitle(p))}, ${esc(p.calendarTime.local.slice(11,16))} Uhr ${esc(currentZone())}, ${planningStatus(p,{needsReview:scheduleNeedsReview(p)}).label}${esc(postLabelDescription(p))}" title="${esc(displayTitle(p))} · ${planningStatus(p,{needsReview:scheduleNeedsReview(p)}).label}">${scheduleNeedsReview(p)?'<span class="schedule-review-badge" aria-label="Termin prüfen">!</span>':''}${platform(p.channels[0],'tiny')}<span>${esc(p.calendarTime.local.slice(11,16))} ${esc(displayTitle(p))}</span></button><button type="button" class="calendar-reschedule" data-reschedule-post="${esc(p.id)}" aria-label="${esc(displayTitle(p))} verschieben">Verschieben</button></div>`).join('')}</section>`}).join('')}</div></div><div class="mobile-month">${renderAgenda(periodPosts(posts),true)}<button class="button subtle" data-action="new-post">${icon('plus')}Beitrag einplanen</button></div>`}
function renderAgenda(posts,mobile=false){if(!posts.length)return emptyState(query||channel!=='all'||postTag!==''||((view==='calendar'||view==='list')&&calendarStatus!=='all')?'Keine passenden Beiträge':'Ein frischer Platz für deine Ideen.',query||channel!=='all'||postTag!==''||((view==='calendar'||view==='list')&&calendarStatus!=='all')?'Versuche einen anderen Suchbegriff oder zeige alle Kanäle an.':'Für diesen Zeitraum ist noch nichts geplant. Lege deinen ersten Beitrag an.',query||channel!=='all'||postTag!==''||((view==='calendar'||view==='list')&&calendarStatus!=='all')?'clear-filters':'new-post',query||channel!=='all'||postTag!==''||((view==='calendar'||view==='list')&&calendarStatus!=='all')?'Filter zurücksetzen':'Beitrag erstellen');const grouped=new Map();posts.forEach(p=>{const key=p.calendarTime.local.slice(0,10);grouped.has(key)?grouped.get(key).push(p):grouped.set(key,[p])});return `<div class="agenda-list">${[...grouped].map(([key,entries])=>`${view==='queue'?'<div class="queue-day-heading">':''}<h3 class="agenda-day">${dateLabel(new Date(`${key}T12:00`),{weekday:'long',day:'numeric',month:'long',...(view==='queue'?{year:'numeric'}:{})})}<span>${entries.length} ${entries.length===1?'Beitrag':'Beiträge'}</span></h3>${view==='queue'?`${queueCalendarDay(key)?`<button type="button" class="button subtle queue-calendar-jump" data-action="queue-calendar" data-queue-day="${esc(key)}" aria-label="${esc(dateLabel(new Date(`${key}T12:00`),{day:'numeric',month:'long',year:'numeric'}))} im Kalender öffnen">${icon('calendar')}Im Kalender</button>`:''}</div>`:''}${entries.map(p=>`${view==='calendar'?'<div class="calendar-post-wrap">':''}<button class="agenda-post" data-post-id="${esc(p.id)}" ${view==='queue'?`aria-describedby="${esc('planning-hint-'+p.id)}"`: ''} aria-label="${esc(displayTitle(p))}, ${esc(p.calendarTime.local.slice(11,16))} Uhr, ${esc(currentZone())}${esc(postLabelDescription(p))}"><span class="agenda-time">${esc(p.calendarTime.local.slice(11,16))}</span>${cover(p,'agenda-cover')}<div class="agenda-body"><strong>${esc(displayTitle(p))}</strong><p>${esc(p.channels.map(id=>CHANNELS.find(c=>c.id===id)?.name).join(' · '))} · ${esc(currentZone())}</p>${calendarContext(p)}${postLabels(p)}${view==='queue'?renderPlanningHint(p,state.channels):''}</div>${stack(p.channels)}${badge(p)}${icon('chevron-right')}</button>${view==='queue'&&queuePriorityAvailable(state,p,channel)?`<button type="button" class="button subtle queue-priority-action" data-queue-priority="${esc(p.id)}" aria-label="${esc(displayTitle(p))} priorisieren">Priorisieren</button>`:''}${view==='calendar'?`<button type="button" class="calendar-reschedule" data-reschedule-post="${esc(p.id)}" aria-label="${esc(displayTitle(p))} verschieben">Verschieben</button></div>`:''}`).join('')}`).join('')}</div>`}
function ideaEditorSnapshot(){return JSON.stringify({title:$('#idea-title').value,text:$('#idea-text').value,tags:$('#idea-tags').value})}
function setIdeaBusy(busy){$('#idea-form').setAttribute('aria-busy',String(busy));for(const control of $$('#idea-form button, #idea-form input, #idea-form textarea'))control.disabled=busy;}
function openIdea(id=null){
  if(saving)return;const idea=id?state.posts.find(p=>p.id===id&&p.status==='idea'):null;if(id&&!idea)return;
  ideaReturnFocus=document.activeElement;editingIdeaId=id;$('#idea-dialog-title').textContent=idea?'Idee bearbeiten':'Idee festhalten';$('#delete-idea').hidden=!idea;
  $('#idea-title').value=idea?.title||'';$('#idea-text').value=idea?.text||'';$('#idea-tags').value=formatIdeaTags(idea?.tags||[]);$('#idea-errors').hidden=true;
  initialIdeaEditor=ideaEditorSnapshot();$('#idea-dialog').showModal();requestAnimationFrame(()=>$('#idea-text').focus());
}
function closeIdea(){if($('#info-dialog').open)$('#info-dialog').close();$('#idea-dialog').close();editingIdeaId=null;if(ideaReturnFocus?.isConnected)ideaReturnFocus.focus();else $('#main').focus();}
function askDiscardIdea(){
  if(saving)return;if(ideaEditorSnapshot()===initialIdeaEditor){closeIdea();return;}
  showInfo('Idee schließen?',`<p>Deine letzten Änderungen sind noch nicht gespeichert.</p><div class="settings-actions"><button class="button subtle" data-action="close-info">Weiter schreiben</button><button class="button primary" data-action="discard-idea">Änderungen verwerfen</button></div>`);
}
async function saveIdea(prepare=false){
  if(saving)return;const previous=state.posts.find(p=>p.id===editingIdeaId);if(previous&&previous.status!=='idea')return;
  let initial;try{initial=JSON.parse(initialIdeaEditor)}catch{initial={}}
  const sameTitle=previous&&$('#idea-title').value===initial.title,sameTags=previous&&$('#idea-tags').value===initial.tags,sameText=previous&&$('#idea-text').value===initial.text;
  let tags;try{tags=sameTags?[...previous.tags]:parseIdeaTags($('#idea-tags').value)}catch(error){$('#idea-errors').hidden=false;$('#idea-errors').textContent=error.message;return;}
  const now=new Date().toISOString();let idea;try{const content={text:sameText?previous.text:$('#idea-text').value};if(!sameTitle)content.title=$('#idea-title').value;if(!sameTags)content.tags=tags;idea=previous?updateIdea(previous,content,{now}):createIdea({...content,id:crypto.randomUUID(),timezone:currentZone(),now});}catch(error){$('#idea-errors').hidden=false;$('#idea-errors').textContent=error.message;return;}

  idea={...idea,scheduledInstant:null,scheduleBinding:null};
  const errors=validateIdea(idea);if(errors.length){$('#idea-errors').hidden=false;$('#idea-errors').textContent=errors.join(' ');$('#idea-errors').scrollIntoView({block:'nearest'});return;}
  const submitted=ideaEditorSnapshot();saving=true;setIdeaBusy(true);let success=false;
  try{success=await persist({...state,posts:[...state.posts.filter(p=>p.id!==idea.id),idea]});}finally{saving=false;setIdeaBusy(false);}
  if(!success)return;
  if(ideaEditorSnapshot()!==submitted){editingIdeaId=idea.id;initialIdeaEditor=submitted;notify('Die gesendete Idee wurde gespeichert. Neuere Änderungen sind noch offen.');return;}
  closeIdea();view='ideas';query='';ideaTag='';$('#search').value='';render();if(prepare)beginIdeaPost(idea.id);else notify('Idee gespeichert. Du findest sie in deiner Ideen-Inbox.');
}
async function deleteIdea(){
  if(saving)return;const idea=state.posts.find(p=>p.id===editingIdeaId&&p.status==='idea');if(!idea)return;
  const deletingEditor=ideaEditorSnapshot();
  $('#info-dialog').close();saving=true;setIdeaBusy(true);let success=false;
  try{success=await persist({...state,posts:state.posts.filter(p=>p.id!==idea.id)});}finally{saving=false;setIdeaBusy(false);}
  if(success){
    if(ideaEditorSnapshot()!==deletingEditor){
      // The source was deleted, but late input is a new unsaved idea. No prior
      // snapshot can make these fields safe to discard, even after an undo edit.
      editingIdeaId=null;initialIdeaEditor='';$('#delete-idea').hidden=true;$('#idea-dialog-title').textContent='Idee festhalten';
      const message='Die gespeicherte Idee wurde gelöscht. Neuere Eingaben bleiben als noch ungespeicherte neue Idee geöffnet.';
      notify(message);const notice=$('#idea-errors');notice.textContent=message;notice.hidden=false;notice.focus();return;
    }
    closeIdea();notify('Idee gelöscht.',()=>restoreDeletedPost(idea));
  }
}
function showDeletedRecovery(post){
  showInfo('Wiederherstellung nicht gespeichert',`<p>Die gelöschte Fassung konnte nicht zurückgespeichert werden. Sichere den Inhalt unten, bevor du die Planung neu lädst. Es wurde nichts automatisch überschrieben.</p><label for="deleted-recovery">Gelöschte Fassung zum Kopieren</label><textarea id="deleted-recovery" class="deleted-recovery" readonly rows="10">${esc(JSON.stringify(post,null,2))}</textarea><p class="field-hint">Enthält Texte, Labels, Termine und Medienverweise. Kein vollständiges Medienbackup oder dauerhafter Papierkorb.</p>`);
}
async function restoreDeletedPost(post){
  if(saving){showDeletedRecovery(post);return;}
  if(state.posts.some(current=>current.id===post.id)){showDeletedRecovery(post);return;}
  saving=true;let success=false;
  try{success=await persist({...state,posts:[...state.posts,post]});}finally{saving=false;}
  if(success)notify(post.status==='idea'?'Idee wiederhergestellt.':'Beitrag wiederhergestellt.');else showDeletedRecovery(post);
}

function beginIdeaPost(id){
  if(saving)return;const idea=state.posts.find(p=>p.id===id&&p.status==='idea');if(!idea)return;
  openComposer(id,null,true);
}
function renderIdeas(){
  const all=state.posts.filter(p=>p.status==='idea');const labels=[...new Set(all.flatMap(p=>p.tags))].sort((a,b)=>a.localeCompare(b,'de'));
  if(ideaTag!==''&&!labels.includes(ideaTag))ideaTag='';
  const ideas=filterIdeas(all,{query,tag:ideaTag});
  const toolbar=`<label class="idea-label-filter"><span class="sr-only">Ideen nach Label filtern</span><select id="idea-label-filter"><option value="">Alle Labels</option>${labels.map(tag=>`<option value="${esc(JSON.stringify(tag))}" ${tag===ideaTag?'selected':''}>${esc(tag)}</option>`).join('')}</select></label>`;
  if(!ideas.length)return toolbar+emptyState(query||ideaTag!==''?'Keine passenden Ideen':'Noch keine Ideen.',query||ideaTag!==''?'Versuche einen anderen Suchbegriff oder zeige alle Labels an.':'Eine Frage, eine Beobachtung, ein erster Satz. Halte fest, was später ein Beitrag werden kann.',query||ideaTag!==''?'clear-idea-filters':'new-idea',query||ideaTag!==''?'Filter zurücksetzen':'Erste Idee festhalten');
  return toolbar+`<div class="ideas-grid">${ideas.map(idea=>`<article class="idea-card"><button class="idea-card-main" data-idea-id="${esc(idea.id)}" aria-label="Idee bearbeiten: ${esc(ideaTitle(idea))}"><span class="idea-card-meta">${icon('sparkles')}Idee · ${dateLabel(new Date(idea.updatedAt),{day:'numeric',month:'short'})}</span><h3>${esc(ideaTitle(idea))}</h3>${idea.text?`<p>${esc(idea.text)}</p>`:'<p class="idea-no-note">Noch ohne Notiz.</p>'}</button>${idea.tags.length?`<div class="idea-labels" aria-label="Labels">${idea.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}<div class="idea-card-footer"><button class="button subtle" data-prepare-idea="${esc(idea.id)}">${icon('file')}Als Beitrag vorbereiten</button><button type="button" class="button subtle" data-reuse-idea="${esc(idea.id)}" ${ideaReuseUI?.available()?'':'disabled'}${state.posts.length>=100?' title="Limit von 100 Beiträgen erreicht. Auch archivierte Beiträge zählen."':''}>Als neuen Entwurf verwenden</button></div></article>`).join('')}</div>`;
}

function renderPostLabelFilter(){
  const labels=postLabelOptions(state.posts);if(postTag!==''&&!labels.includes(postTag))postTag='';
  $('#post-label-filter-wrap').hidden=['ideas','connections'].includes(view);
  $('#post-label-filter').innerHTML='<option value="">Alle Labels</option>'+labels.map(tag=>`<option value="${esc(JSON.stringify(tag))}" ${tag===postTag?'selected':''}>${esc(tag)}</option>`).join('');
}
function renderPlanningChannelControls(){
  $('#channel-filter').innerHTML='<option value="all">Alle Kanäle</option>'+CHANNELS.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('#channel-filter').value=channel;$('#planning-channel-count').textContent=String(CHANNELS.length);
}
function render(){
  queuePriorityUI?.checkState();
  queueReflowUI?.checkState();
  dateShiftUI?.checkState();
  queueSwapUI?.checkState();
  returnDraftsUI?.checkState();
  draftLabelsUI?.checkState();
  draftReplaceUI?.checkState();
  archiveDraftsUI?.checkState();
  const draftFocus=view==='drafts'&&document.activeElement?.dataset?.draftOccurrence?document.activeElement:null;
  const planningRenderedAt=String(Date.now());
  const expandedActions=new Set($$('details[data-ui-actions][open]').map(el=>el.dataset.uiActions));
  document.body.dataset.plannerView=view;
  document.body.dataset.editorialView=['ideas','drafts'].includes(view)?view:'';
  $('#idea-label-filter-wrap').hidden=view!=='ideas';
  $('#draft-grouping-wrap').hidden=view!=='drafts';$('#draft-grouping').value=draftGrouping;$('#draft-grouping-status').hidden=view!=='drafts'||draftGrouping!=='labels';
  history.replaceState(null,'',`#${view}`);
  const connections=view==='connections';renderPostLabelFilter();renderPlanningChannelControls();
  $('.overview').hidden=true;$('.view-tabs').hidden=!['calendar','list','queue'].includes(view);$('.view-toolbar').hidden=connections||view==='home';$('.planner-panel').hidden=connections;$('.bottom-note').hidden=connections||['ideas','drafts','home','archive'].includes(view);$('.create-post').hidden=connections;
  if(connections)connectionsPanel.show();else connectionsPanel.hide();
  $('#idea-count').textContent=state.posts.filter(p=>p.status==='idea').length;
  const drafts=state.posts.filter(p=>p.status==='draft').length;$('#draft-count').textContent=drafts;$('#draft-tab-count').textContent=drafts;$('#draft-stat').textContent=drafts;$('#planned-stat').textContent=state.posts.filter(p=>p.status==='scheduled').length;
  $$('[data-view]').forEach(button=>{const active=button.dataset.view===view||(view==='list'&&button.dataset.view==='calendar'&&!button.classList.contains('view-tab'));button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false')});
  $('#sidebar-channels').innerHTML=state.channels.map(c=>`<button class="channel-row ${channel===c.id?'active':''}" data-channel="${c.id}">${platform(c.id)}<span><strong>${esc(c.name)}</strong><small>Planungsziel</small></span></button>`).join('');
  if(view==='ideas'&&ideaTag!==''&&!state.posts.some(p=>p.status==='idea'&&p.tags.includes(ideaTag)))ideaTag='';
  const filterCount=(view==='ideas'?Number(ideaTag!==''):Number(channel!=='all')+Number(postTag!==''));
  $('#active-filter-count').textContent=String(filterCount);$('#active-filter-count').hidden=filterCount===0;$('#reset-view-filters').hidden=filterCount===0&&!query;$('#reset-view-filters').dataset.action=view==='ideas'?'clear-idea-filters':'clear-filters';
  if(connections){$('#page-title').textContent='Verbindungen';$('#page-description').textContent='Konten und Freigaben.';return;}
  if(view==='home'){$('#page-title').textContent='Deine Übersicht';$('#page-description').textContent='Termine und Entwürfe.';$('.create-post').dataset.action='new-post';$('.create-post span:last-child').textContent='Beitrag erstellen';$('#calendar-toolbar').hidden=true;$('#post-filter-summary').hidden=true;$('#content').innerHTML=renderHomeOverview(state,new Date(),{available:plannerLoaded,expanded:homeExpanded});$('#content').dataset.planningRenderedAt=planningRenderedAt;return;}
  if(view==='archive'){
    $('#page-title').textContent='Archiv';$('#page-description').textContent='';$('.create-post').hidden=true;
    $('#calendar-toolbar').hidden=true;$('#post-filter-summary').hidden=true;$('#channel-filter-wrap').hidden=false;
    $('#search').placeholder='Archiv durchsuchen';$('#search').setAttribute('aria-label','Archiv durchsuchen');
    if(!plannerLoaded){$('#content').innerHTML='<p class="home-unavailable" role="status">Planung nicht verfügbar.</p>';return;}
    const archived=filterPosts(state.posts,{channel,query,tag:postTag,status:'archived'}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    $('#content').innerHTML=archived.length?`<div class="draft-grid">${archived.map(p=>`<article class="post-card archive-card"><strong>${esc(displayTitle(p))}</strong><p class="post-card-text">${esc(p.text)}</p>${stack(p.channels)}${postLabels(p)}<button type="button" class="button subtle" data-action="copy-archive" data-archive-id="${esc(p.id)}">Als neuen Entwurf übernehmen</button></article>`).join('')}</div>`:'<p class="home-empty">Keine archivierten Beiträge.</p>';
    return;
  }
  if(view==='queue'){
    $('#page-title').textContent='Queue';$('#page-description').textContent='Anstehende Beiträge je Kanal.';
    $('.create-post').dataset.action='new-post';$('.create-post span:last-child').textContent='Beitrag erstellen';
    $('#channel-filter-wrap').hidden=false;$('#search').placeholder='Queue durchsuchen';$('#search').setAttribute('aria-label','Queue durchsuchen');
    $('#calendar-toolbar').hidden=true;$('#post-filter-summary').hidden=true;
    $('#content').innerHTML=renderChannelQueue(state,{channel,query,tag:postTag,status:queueStatus,available:plannerLoaded,renderAgenda,actionsExpanded:expandedActions.has('queue')});$('#content').dataset.planningRenderedAt=planningRenderedAt;return;
  }
  $('#page-title').textContent=view==='ideas'?'Ideen':view==='drafts'?'Entwürfe':view==='calendar'?'Planung':'Beitragsliste';$('#page-description').textContent=view==='ideas'?'Notizen ohne Kanal oder Termin.':view==='drafts'?'Weiterarbeiten und planen.':'Deine Beiträge im Blick.';
  $('.create-post').dataset.action=view==='ideas'?'new-idea':view==='drafts'?'new-draft':'new-post';$('.create-post span:last-child').textContent=view==='ideas'?'Idee festhalten':view==='drafts'?'Entwurf erstellen':'Beitrag erstellen';$('#channel-filter-wrap').hidden=view==='ideas';$('#search').placeholder=view==='ideas'?'Ideen suchen':view==='drafts'?'Entwürfe durchsuchen':'Beiträge suchen';$('#search').setAttribute('aria-label',view==='ideas'?'Ideen durchsuchen':view==='drafts'?'Entwürfe durchsuchen':'Beiträge durchsuchen');
  $('#calendar-status').value=calendarStatus;$('#calendar-toolbar').hidden=['drafts','ideas'].includes(view);$('#channel-filter').value=channel;
  $('#timezone').textContent=currentZone();$('#timezone').title='Alle Kalenderzeiten in dieser Zeitzone. Die ursprünglichen Beitragstermine bleiben erhalten.';
  const p=visiblePeriod();$('#period-title').textContent=range==='month'?dateLabel(anchor,{month:'long',year:'numeric'}):`${p.start.getDate()}. ${p.start.getMonth()!==p.end.getMonth()?dateLabel(p.start,{month:'short'})+' ':''}– ${dateLabel(p.end,{day:'numeric',month:'long',year:'numeric'})}`;
  $$('[data-range]').forEach(b=>{b.classList.toggle('selected',b.dataset.range===range);b.setAttribute('aria-pressed',String(b.dataset.range===range))});
  const posts=relevantPosts();const filtered=!!query||channel!=='all'||postTag!==''||(view!=='drafts'&&calendarStatus!=='all');$('#post-filter-summary').hidden=['ideas','connections'].includes(view)||!filtered||(view==='drafts'&&posts.length===0);const count=view==='drafts'?posts.length:periodPosts(posts).length;$('#post-filter-result').textContent=`${count} ${count===1?'Beitrag passt':'Beiträge passen'}${view==='drafts'?'':' im gewählten Zeitraum'} zu deinen Filtern${postTag!==''?` · Label: ${postTag}`:''}.`;if(view==='ideas')$('#content').innerHTML=renderIdeas();else if(view==='drafts')$('#content').innerHTML=posts.length?`<div class="draft-section-head"><span>${posts.length} ${posts.length===1?'Entwurf':'Entwürfe'}</span><details class="ui-disclosure" data-ui-actions="drafts" ${expandedActions.has('drafts')?'open':''}><summary>Mehrere bearbeiten</summary><div class="ui-disclosure-body"><button type="button" class="button subtle" data-action="batch-drafts">Entwürfe einplanen</button><button type="button" class="button subtle" data-action="replace-drafts">Text ersetzen</button><button type="button" class="button subtle" data-action="label-drafts">Labels bearbeiten</button><button type="button" class="button subtle" data-action="archive-drafts">Entwürfe archivieren</button></div></details></div>${draftGrouping==='labels'?renderDraftGroups([...posts].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),postCard):`<div class="draft-grid">${posts.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(postCard).join('')}</div>`}`:emptyState(query||channel!=='all'||postTag!==''?'Keine passenden Entwürfe':'Noch keine Entwürfe.',query||channel!=='all'||postTag!==''?'Passe deine Suche an oder setze die Filter zurück.':'Starte einen neuen Entwurf oder arbeite eine deiner Ideen als Beitrag aus.',query||channel!=='all'||postTag!==''?'clear-filters':'new-draft',query||channel!=='all'||postTag!==''?'Filter zurücksetzen':'Entwurf erstellen');
  else if(view==='list')$('#content').innerHTML=renderCalendarSummary(posts)+renderAgenda(periodPosts(posts));else $('#content').innerHTML=renderCalendarSummary(posts)+(range==='month'?renderMonth(posts):renderWeek(posts));
  $('#jump-date').value=dateKey(anchor);
  if(view==='ideas')$('#idea-label-filter-wrap').replaceChildren($('#content .idea-label-filter'));
  $('#content').dataset.planningRenderedAt=planningRenderedAt;
  if(draftFocus&&!restoreDraftCardFocus(draftFocus,$('#content')))$('#main').focus();
}
function notify(message,undo){clearTimeout(toastTimer);$('#toast-text').textContent=message;$('#toast').hidden=false;undoAction=undo||null;$('#toast-undo').hidden=!undo;toastTimer=setTimeout(()=>{$('#toast').hidden=true;undoAction=null},undo?12000:6500)}
async function persist(next,{requireReceipt=false}={}){try{const result=await store.save(normalizeState(next));if(requireReceipt&&(!result||!Number.isSafeInteger(result.revision)||result.revision!==next.revision+1||!Array.isArray(result.posts)))throw Error('Speicherbestätigung unklar. Bitte neu laden und den gespeicherten Stand prüfen; nicht erneut speichern.');state=normalizeState(result||next);render();return true}catch(error){const editing=$('#composer').open||$('#idea-dialog').open;const message=error?.status===409||error?.code==='CONFLICT'?(editing?'Die Planung wurde inzwischen geändert. Deine Eingabe bleibt hier erhalten. Kopiere sie vor dem Neuladen und übernimm sie anschließend in die aktuelle Fassung.':'Die Planung wurde inzwischen geändert. Diese Änderung wurde nicht gespeichert. Lade den aktuellen Stand, bevor du es erneut versuchst.'):error?.message||(editing?'Speichern fehlgeschlagen. Deine Eingabe bleibt geöffnet.':'Speichern fehlgeschlagen. Die Änderung wurde nicht übernommen.');if($('#composer').open){$('#form-errors').hidden=false;$('#form-errors').textContent=message;}if($('#idea-dialog').open){$('#idea-errors').hidden=false;$('#idea-errors').textContent=message;}notify(message);return false}}
function editorSnapshot(){return JSON.stringify({savedAlt:typeof savedAltEdit!=='undefined'&&savedAltEdit&&$('#media-alt')?.value!==composerMedia?.alt?$('#media-alt')?.value:null,planning:composerTiming.snapshot,tags:$('#post-tags').value,text:composerBaseText,variantTexts:composerVariantTexts,channels:$$('#composer-channels input:checked').map(i=>i.value),date:$('#post-date').value,time:$('#post-time').value,zone:$('#post-zone').value,mediaItems:composerImages.items,...(typeof composerChannelMedia!=='undefined'&&composerChannelMedia?{channelMediaItems:composerChannelMedia}:{}),cover:composerCover})}
function setComposerDate(date){$('#post-date').value=date;$('#post-time').value='10:00'}
function populateZoneSelect(el,selected){const common=[defaultTimeZone(),'Europe/Berlin','Europe/Vienna','Europe/Zurich','Europe/London','America/New_York','America/Los_Angeles','Asia/Tokyo','Australia/Sydney','UTC',selected];const zones=[...new Set(common)].filter(isTimeZone);el.innerHTML=zones.map(zone=>`<option value="${esc(zone)}" ${zone===selected?'selected':''}>${esc(zone)}</option>`).join('')}
function renderComposerChannels(channels){if(!Array.isArray(channels)||new Set(channels).size!==channels.length||channels.some(id=>!CHANNELS.some(c=>c.id===id)))throw Error('Kanalreihenfolge kann nicht verlustfrei übernommen werden.');$('#composer-channels').innerHTML=[...channels.map(id=>CHANNELS.find(c=>c.id===id)),...CHANNELS.filter(c=>!channels.includes(c.id))].map(c=>`<label class="channel-choice">${platform(c.id)}<span>${c.name}</span><input type="checkbox" name="channels" value="${c.id}" ${channels.includes(c.id)?'checked':''} aria-label="${c.name} auswählen"></label>`).join('');}
function openComposer(id=null,date=null,draft=false,continuation=null){if(saving||workspacePlannerReading)return;videoWorkspaceVersion=2;cancelSavedAlt(false);savedTextPicker?.close({restoreFocus:false});postTemplatePicker?.close({restoreFocus:false});closeDraftSplit();composerSavedRevision=state.revision;queuePanel?.reset();composerGeneration++;mediaGeneration++;mediaLoading=false;returnFocus=document.activeElement;editingId=id;const post=id?state.posts.find(p=>p.id===id):null;if(id&&(!post||post.status==='archived'))return;composerChannelMedia=post?.channelMediaItems?structuredClone(post.channelMediaItems):null;channelPreviewIndex={};composerRestoredWorkspace=false;$('#calendar-reschedule-summary').hidden=true;composerTiming.open(post);composerIdeaFingerprint=post?.status==='idea'?prepareIdeaDraft(post).sourceFingerprint:null;$('#composer-title').textContent=post?.status==='idea'?'Aus Idee wird Beitrag':post?'Beitrag bearbeiten':draft?'Entwurf erstellen':'Beitrag erstellen';$('#idea-origin').hidden=post?.status!=='idea';$('#idea-origin').textContent=post?.status==='idea'?`Idee: ${ideaTitle(post)} · Erst Speichern wandelt sie in einen Beitrag um.`:'';$('#variant-announcement').textContent='';$('#channel-checks').open=false;composerBaseText=post?.text||'';composerVariantTexts=structuredClone(post?.variantTexts||{});activeTextTarget='base';$('#post-text').value=composerBaseText;$('#post-tags').value=formatIdeaTags(post?.tags||[]);$('#composer-labels').open=!!post?.tags?.length;$('#media-options').open=false;$('#composer-actions').open=$('#continue-composer').checked;composerLabelState={title:post?.title||'',tags:[...(post?.tags||[])],raw:formatIdeaTags(post?.tags||[]),rendered:$('#post-tags').value,baseline:formatIdeaTags(post?.tags||[])};composerMissingMedia=false;$('#workspace-missing-media').hidden=true;composerImages.reset(post?.mediaItems||[]);composerMedia=composerImages.selected;composerCover=post?.cover||null;const channels=continuation?.channels||post?.channels||(channel==='all'?(draft?[]:['instagram']):[channel]);renderComposerChannels(channels);const tomorrow=addDays(zonedNow(post?.timeZone||currentZone()),1);setComposerDate(date||post?.scheduledAt?.slice(0,10)||dateKey(tomorrow));if(post?.scheduledAt)$('#post-time').value=post.scheduledAt.slice(11,16);populateZoneSelect($('#post-zone'),continuation?.timeZone||post?.timeZone||currentZone());if(continuation){$('#post-date').value='';$('#post-time').value='';$('#media-file').value='';}$('#edit-actions').hidden=!post||post.status==='idea';$('#mastodon-handoff').hidden=!post||post.status==='idea'||!post.channels.includes('mastodon');$('#form-errors').hidden=true;$('#schedule-post').disabled=false;$('#save-draft').disabled=false;$('#post-date').min=dateKey(zonedNow($('#post-zone').value));renderMediaEditor();renderVariantTabs();renderPreview();initialEditor=editorSnapshot();$('#composer').showModal();void refreshMastodonPlanningStatus($('#mastodon-planning-status'));if(!workspaceRestoring)workspaceUI?.editorOpened({sourcePostId:post?.id||null,basePlannerRevision:Number.isSafeInteger(store.plannerRevision)?store.plannerRevision:null});if(typeof updateChannelMediaAvailability==='function')updateChannelMediaAvailability();updateDraftSplitAvailability();const openedGeneration=composerGeneration;requestAnimationFrame(()=>{if(composerGeneration!==openedGeneration||!$('#composer').open)return;if($('#calendar-reschedule-summary').hidden){$('#composer .composer-body').scrollTop=0;$('#post-text').focus({preventScroll:true});}else{$('#post-date').scrollIntoView({block:'center'});$('#post-date').focus({preventScroll:true});}})}
function applyCalendarReschedule(post,proposal){
  if(calendarRescheduleBusy()||proposal.unchanged)return false;
  openComposer(post.id);
  if(!$('#composer').open||editingId!==post.id)return false;
  composerTiming.manual();$('#post-date').value=proposal.local.slice(0,10);$('#post-time').value=proposal.local.slice(11,16);
  const summary=$('#calendar-reschedule-summary');summary.textContent=proposal.from.replace('T',' · ')+' → '+proposal.to.replace('T',' · ')+' · '+proposal.calendarZone;summary.hidden=false;
  renderPreview();$('#post-date').focus();return true;
}
function calendarRescheduleBusy(){return !plannerLoaded||saving||mediaLoading||workspacePlannerReading||workspaceRestoring||!!document.querySelector('dialog[open]:not(#calendar-reschedule-dialog)');}
function askDiscard(){if(saving)return;if(editorSnapshot()===initialEditor&&!workspaceUI?.hasUnsavedLocalInput||workspaceUI?.canCloseSafely&&!savedAltEdit&&!composerImages.items.some(item=>item.dataUrl)&&!composerMissingMedia){closeComposer();return}showInfo('Änderungen verwerfen?',`<p>Nicht bestätigte Änderungen und lokale Mediendateien gehen beim Schließen verloren. Bereits gesicherte Arbeitsfassungen bleiben zur Wiederaufnahme erhalten. Möchtest du den Editor trotzdem schließen?</p><div class="settings-actions"><button class="button subtle" data-action="close-info">Weiter bearbeiten</button><button class="button primary" data-action="discard-composer">Änderungen verwerfen</button></div>`)}
function closeComposer(){videoTailEditor.close();videoTailTarget=null;videoSelectionController?.abort();videoSelectionController=null;for(const v of $$('#composer video'))v.pause();videoPreviewURLs.clear();clearMastodonPlanningStatus();composerFileDrop.reset();if(typeof channelMediaUI!=='undefined'&&channelMediaUI?.isOpen&&!channelMediaUI.close())return;composerChannelMedia=null;channelPreviewIndex={};cancelSavedAlt(false);savedTextPicker?.close({restoreFocus:false});postTemplatePicker?.close({restoreFocus:false});closeDraftSplit();imageStudio.close({force:true});composerTiming.open();workspaceUI?.editorClosed();queuePanel?.reset();composerGeneration++;mediaGeneration++;mediaLoading=false;if($('#info-dialog').open)$('#info-dialog').close();$('#composer').close();editingId=null;composerIdeaFingerprint=null;composerRestoredWorkspace=false;composerImages.reset();composerMedia=null;composerCover=null;returnFocus?.isConnected?returnFocus.focus():(view==='drafts'&&returnFocus?.dataset?.draftOccurrence&&restoreDraftCardFocus(returnFocus,$('#content')))||$('#main').focus()}
function renderMediaEditor(){const rich=typeof composerChannelMedia!=='undefined'&&!!composerChannelMedia;for(const id of ['add-media','add-video','add-media-batch','choose-saved-image']){const el=$('#'+id);if(el)el.disabled=rich||saving;}const lock=$('#channel-media-lock');if(lock){lock.hidden=!rich;lock.textContent=state.posts?.find(p=>p.id===editingId)?.status==='draft'?'Eigene Kanalbilder · unter „Weitere Aktionen“ bearbeiten.':'Eigene Kanalbilder · Vorschau je Kanal.';}const drop=$('#composer-file-drop');if(drop)drop.hidden=rich;if(rich){$('#media-strip').innerHTML='';$('#media-total').textContent='';$('#media-editor').hidden=true;return;}composerMedia=composerImages.selected;if(isVideoMedia(composerMedia)){
 const m=composerMedia;$('#media-strip').innerHTML='';$('#media-total').textContent='1 Video';const media=$('#media-editor');media.hidden=false;media.className='media-editor';media.innerHTML=`<div class="media-alt"><strong>${esc(m.name)}</strong><label for="media-alt">Beschreibung${m.id?' (schreibgeschützt)':''}</label><input id="media-alt" maxlength="2000" ${m.id?'readonly':''} value="${esc(m.alt||'')}"></div><a class="button subtle" href="${esc(mediaSource(m))}" download="${esc(m.name)}">Original herunterladen</a><button type="button" class="button subtle" data-action="preserve-video-original">Original als Entwurf behalten</button><span id="preserve-original-status" role="status" class="field-hint">${m.id?'Nur unverändert gespeicherte Beiträge. Erst sichern, dann kürzen.':'Original zuerst speichern und erneut öffnen.'}${preservedOriginalLink()}</span>${m.type==='video/mp4'?'<button type="button" class="button subtle" data-action="trim-video-start">MP4-Anfang kürzen (ohne Ton)</button>':''}<button type="button" class="button subtle" data-action="trim-video-tail">${m.type==='video/mp4'?'MP4':'WebM'}-Ende kürzen</button><button type="button" class="icon-button" data-action="remove-media" aria-label="Video entfernen">${icon('x')}</button>`;return;}
videoPreviewURLs.clear();const strip=$('#media-strip');strip.innerHTML=composerImages.rows.map((row,index)=>`<button type="button" class="carousel-thumb" data-media-key="${esc(row.key)}" aria-label="Bild ${index+1} auswählen" aria-pressed="${row.key===composerImages.selectedKey}"><img src="${esc(mediaSource(row.media))}" alt=""><span>${index+1}</span></button>`).join('');$('#media-total').textContent=`${composerImages.length} / 10 Bilder`;const media=$('#media-editor');if(composerMedia){media.hidden=false;media.className='media-editor';media.innerHTML=`<img class="media-thumbnail" src="${esc(mediaSource(composerMedia))}" alt="${esc(composerMedia.alt)}"><div class="media-alt"><label for="media-alt">Alternativtext${imageAltIsReadOnly(composerMedia)?' (schreibgeschützt)':''}</label><input id="media-alt" maxlength="${imageAltIsReadOnly(composerMedia)?2000:500}" ${imageAltIsReadOnly(composerMedia)?'readonly':''} placeholder="Was ist auf dem Bild zu sehen?" value="${esc(composerMedia.alt||'')}"></div>${imageAltIsReadOnly(composerMedia)?'<button type="button" class="button subtle" data-action="edit-saved-alt">Beschreibung ändern</button>':''}<button type="button" class="button subtle media-edit-action" data-action="edit-image">Bild bearbeiten / ersetzen</button><button type="button" class="button subtle" data-action="move-media-left" ${composerImages.index===0?'disabled':''}>Nach links</button><button type="button" class="button subtle" data-action="move-media-right" ${composerImages.index===composerImages.length-1?'disabled':''}>Nach rechts</button><button type="button" class="icon-button" data-action="remove-media" aria-label="Bild entfernen">${icon('x')}</button>`}else if(composerCover){media.hidden=false;media.className='media-editor';media.innerHTML=`<div class="cover cover-${composerCover}" style="width:52px;height:52px;margin:0;flex-shrink:0" role="img" aria-label="Demo-Illustration"></div><div class="media-alt"><label>Demo-Illustration</label><span class="field-hint">Abstraktes Beispielbild</span></div><button type="button" class="icon-button" data-action="remove-media" aria-label="Demo-Illustration entfernen">${icon('x')}</button>`}else{media.hidden=true;media.innerHTML=''}}
function refreshMediaFocus(action=null){
  renderMediaEditor();renderPreview();
  const requested=action?Array.from(document.querySelectorAll('#media-editor [data-action], #preview-cover [data-action]')).find(button=>button.dataset.action===action&&!button.disabled):null;
  const selected=Array.from(document.querySelectorAll('#media-strip [data-media-key]')).find(button=>button.dataset.mediaKey===composerImages.selectedKey);
  (requested||selected||$('#add-media'))?.focus({preventScroll:true});
}
function editorPost(){return{text:composerBaseText,variantTexts:composerVariantTexts,channels:$$('#composer-channels input:checked').map(i=>i.value)}}
function renderVariantTabs(){
  const post=editorPost();if(activeTextTarget!=='base'&&!post.channels.includes(activeTextTarget))activeTextTarget='base';
  const targets=[{id:'base',name:'Basistext'},...post.channels.map(id=>CHANNELS.find(c=>c.id===id))];
  $('#variant-tabs').innerHTML=targets.map(c=>`<button type="button" role="tab" id="text-tab-${c.id}" data-text-target="${c.id}" aria-controls="variant-panel" aria-selected="${c.id===activeTextTarget}" tabindex="${c.id===activeTextTarget?'0':'-1'}" class="variant-tab ${c.id===activeTextTarget?'active':''}" aria-label="${esc(c.name)}${c.id==='base'?'':hasTextVariant(post,c.id)?', eigener Text':', Basistext'}">${c.id==='base'?icon('layers'):platform(c.id,'tiny')}<span>${esc(c.name)}</span>${c.id!=='base'&&hasTextVariant(post,c.id)?'<span class="custom-dot" aria-hidden="true"></span>':''}</button>`).join('');
  $('#variant-panel').setAttribute('aria-labelledby',`text-tab-${activeTextTarget}`);
}
function updateVariantSummary(){
  const post=editorPost(),target=CHANNELS.find(c=>c.id===activeTextTarget),custom=activeTextTarget!=='base'&&hasTextVariant(post,activeTextTarget);
  $('.editor-label label').textContent=target?`Text für ${target.name}`:'Basistext';
  const inherited=inheritedChannels(post).length,count=variantCount(post);
  $('#variant-mode-hint').textContent=target?(custom?'Eigener Text':'Basistext'):'';
  $('#reset-variant').hidden=!custom;
  const review=renderChannelTextReview(post,CHANNELS);
  $('#channel-review-summary').innerHTML=review.summary;
  $('#channel-review-items').innerHTML=review.items;
  // Update labels without replacing the currently focused tab during typing.
  $$('#variant-tabs [data-text-target]').forEach(tab=>{const id=tab.dataset.textTarget;if(id==='base')return;const own=hasTextVariant(post,id);tab.setAttribute('aria-label',`${CHANNELS.find(c=>c.id===id).name}, ${own?'eigener Text':'Basistext'}`);const dot=tab.querySelector('.custom-dot');if(own&&!dot){const mark=document.createElement('span');mark.className='custom-dot';mark.setAttribute('aria-hidden','true');tab.append(mark)}else if(!own&&dot)dot.remove()});
}
function switchTextTarget(target,focusEditor=false){
  if(target!=='base'&&!editorPost().channels.includes(target))return;activeTextTarget=target;$('#post-text').value=target==='base'?composerBaseText:effectiveText(editorPost(),target);renderVariantTabs();renderPreview(target==='base'?null:target);if(focusEditor)$('#post-text').focus();else $(`#text-tab-${target}`).focus();
}
function handleTextInput(){if(activeTextTarget==='base')composerBaseText=$('#post-text').value;else composerVariantTexts[activeTextTarget]=$('#post-text').value;renderPreview()}
function handleChannelChange(event){
  const input=event.target;if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia){input.checked=!input.checked;return;}if(composerTiming.snapshot.scheduleBinding||composerTiming.snapshot.needsReplan){input.checked=!input.checked;renderTimingStatus();return;}if(!input.checked&&hasTextVariant(editorPost(),input.value)){input.checked=true;const name=CHANNELS.find(c=>c.id===input.value).name;showInfo('Kanalvariante entfernen?',`<p>Für ${esc(name)} hast du einen eigenen Text. Wenn du diesen Kanal entfernst, wird seine Version aus dem Beitrag entfernt. Der Basistext und andere Kanäle bleiben erhalten.</p><div class="settings-actions"><button class="button subtle" data-action="close-info">Kanal behalten</button><button class="button primary" data-action="remove-variant-channel" data-variant-channel="${input.value}">Kanal entfernen</button></div>`);return}
  if(activeTextTarget!=='base'&&!editorPost().channels.includes(activeTextTarget))switchTextTarget('base');renderVariantTabs();renderPreview();
}
function askResetVariant(){const id=activeTextTarget;if(id==='base'||!hasTextVariant(editorPost(),id))return;const name=CHANNELS.find(c=>c.id===id).name;showInfo('Wieder den Basistext verwenden?',`<p>Der eigene Text für ${esc(name)} wird durch den aktuellen Basistext ersetzt. Spätere Änderungen am Basistext gelten dann wieder für diesen Kanal.</p><div class="settings-actions"><button class="button subtle" data-action="close-info">Eigenen Text behalten</button><button class="button primary" data-action="reset-variant-confirm" data-variant-channel="${id}">Basistext verwenden</button></div>`)}
function renderPreview(preferredChannel=null){
  updateDraftSplitAvailability();
  if(typeof updateChannelMediaAvailability==='function')updateChannelMediaAvailability();
  queuePanel?.invalidate();
  const post=editorPost(),selected=post.channels,previous=preferredChannel||$('#preview-channel').value;
  $('#mastodon-planning-status').hidden=!selected.includes('mastodon');
  $('#preview-channel').innerHTML=selected.map(id=>`<option value="${id}">${CHANNELS.find(c=>c.id===id).name}${hasTextVariant(post,id)?' · eigener Text':''}</option>`).join('')||'<option value="">Kein Kanal ausgewählt</option>';if(!saving)$('#preview-channel').disabled=!selected.length;if(selected.includes(previous))$('#preview-channel').value=previous;
  const active=CHANNELS.find(c=>selected.includes(c.id)&&c.id===$('#preview-channel').value)||{id:'base',name:'Klartext',handle:''},text=active.id==='base'?composerBaseText:effectiveText(post,active.id)||'';
  $('#preview-name').textContent=active.id==='mastodon'?'Mastodon · Planungsvorschau':'Studio Nord';$('#preview-avatar').textContent=active.id==='mastodon'?'m':'N';$('#preview-handle').textContent=active.handle;$('#preview-text').textContent=text||'Für diesen Kanal ist noch kein Text vorhanden.';$('#preview-text').classList.toggle('placeholder',!text);const rich=typeof composerChannelMedia!=='undefined'&&composerChannelMedia;const previewItems=rich?(composerChannelMedia[active.id]||[]):composerImages.items;const previewIndex=rich?Math.min(channelPreviewIndex[active.id]||0,Math.max(0,previewItems.length-1)):composerImages.index;const previewMedia=rich?previewItems[previewIndex]:composerMedia;const previewMarkup=cover({mediaItems:previewMedia?[previewMedia]:[],cover:rich?null:composerCover},'',true)+(previewItems.length>1?`<div class="carousel-navigation"><button type="button" class="button subtle" data-action="${rich?'previous-channel-media':'previous-media'}" ${previewIndex===0?'disabled':''}>Vorheriges Bild</button><span>${previewIndex+1} / ${previewItems.length}</span><button type="button" class="button subtle" data-action="${rich?'next-channel-media':'next-media'}" ${previewIndex===previewItems.length-1?'disabled':''}>Nächstes Bild</button></div>`:'');if(!isVideoMedia(previewMedia)||$('#preview-cover').dataset.videoSource!==mediaSource(previewMedia)){$('#preview-cover').innerHTML=previewMarkup;$('#preview-cover').dataset.videoSource=isVideoMedia(previewMedia)?mediaSource(previewMedia):'';}if(isVideoMedia(previewMedia))$('#preview-cover video')?.setAttribute('aria-label',previewMedia.alt||previewMedia.name);
  updateVisualPresentation({channelId:activeTextTarget,header:$('#visual-text-heading'),note:$('#visual-text-note')});
  updateVisualPresentation({channelId:active.id,preview:$('.social-preview'),previewNote:$('.preview-disclaimer')});
  $('#preview-name').textContent=active.name+' · Planungsvorschau';$('#preview-handle').textContent=selected.length?'Kein Liveprofil':'Kein Kanal ausgewählt';if(!selected.length){$('#preview-avatar').textContent='–';}
  const currentText=activeTextTarget==='base'?composerBaseText:effectiveText(post,activeTextTarget),count=characterCount(currentText),inherit=inheritedChannels(post);const target=CHANNELS.find(c=>c.id===activeTextTarget),limit=target?target.limit:inherit.length?Math.min(...inherit.map(id=>CHANNELS.find(c=>c.id===id).limit)):null;
  $('#character-counter').textContent=limit?`${count.toLocaleString('de-DE')} / ${limit.toLocaleString('de-DE')} Zeichen`:`${count.toLocaleString('de-DE')} Zeichen`;$('#character-counter').classList.toggle('over-limit',limit&&count>limit);
  $('#character-hint').textContent=!selected.length?'':limit&&count>limit?'Zeichenlimit überschritten. Als Entwurf speicherbar.':'';
  $('#schedule-timezone').textContent=`${$('#post-zone').value} · Kein automatischer Versand.`;renderTimingStatus();updateVariantSummary();if($('#composer').open&&!workspaceRestoring&&!saving)workspaceUI?.captureChanged();
}
function renderTimingStatus(){
  const timing=composerTiming.snapshot,bound=!!timing.scheduleBinding,locked=bound||timing.needsReplan;
  $('#post-date').readOnly=locked;$('#post-time').readOnly=locked;if(!saving)$('#post-zone').disabled=locked;
  for(const field of $$('#composer-channels input'))if(!saving)field.disabled=locked||(typeof composerChannelMedia!=='undefined'&&!!composerChannelMedia);
  const post={...editorPost(),status:'scheduled',scheduledAt:$('#post-date').value&&$('#post-time').value?`${$('#post-date').value}T${$('#post-time').value}`:null,timeZone:$('#post-zone').value,...timing};
  const review=bound&&inspectScheduleBinding(post,state.channels).state==='needs_review';
  const label=timing.needsReplan?'Wiederaufgenommener Termin: bitte bewusst neu wählen.':review?'Dieser Termin braucht eine Prüfung. Er bleibt unverändert.':bound?'An gespeicherte Kanalzeiten gebunden.':'Manueller Termin · unabhängig von Wochenzeiten.';
  $('#schedule-binding-status').innerHTML=`<span>${esc(label)}</span>${locked?`<button type="button" class="button subtle" data-action="manual-time">${timing.needsReplan?'Termin neu wählen':'Bindung lösen & manuell planen'}</button>`:''}${renderPlanningGuidance(post,state.channels,{needsReplan:timing.needsReplan})}`;
}
function manualComposerTime(){if(saving)return;const replan=composerTiming.snapshot.needsReplan;composerTiming.manual();if(replan){$('#post-date').value='';$('#post-time').value='';}renderPreview();$('#post-date').focus();}
function composerTimeChanged(){composerTiming.changed(`${$('#post-date').value}T${$('#post-time').value}`,$('#post-zone').value);queuePanel?.invalidate();renderTimingStatus();if(!saving&&!workspaceRestoring)workspaceUI?.captureChanged();}
function currentComposerRawTags(){const value=$('#post-tags').value;return composerLabelState&&value===composerLabelState.rendered?composerLabelState.raw:value;}
function captureWorkspacePayload(){if(composerImages.items.some(isVideoMedia))videoWorkspaceVersion=3;const metadata=item=>({alt:item.alt??'',name:item.name??'',type:item.type??''});return {schemaVersion:videoWorkspaceVersion,planning:composerTiming.planning,title:composerLabelState?.title||'',tags:[...(composerLabelState?.tags||[])],rawTags:currentComposerRawTags(),baselineRenderedTags:composerLabelState?.baseline||'',text:composerBaseText,variantTexts:structuredClone(composerVariantTexts),channels:$$('#composer-channels input:checked').map(x=>x.value),date:$('#post-date').value,time:$('#post-time').value,timeZone:$('#post-zone').value,mediaItems:composerImages.items.map(item=>item.id&&item.url&&!item.dataUrl?{kind:isVideoMedia(item)?'planner_video':'planner_image',id:item.id,...metadata(item)}:{kind:'local_omitted',...metadata(item)}),cover:composerCover,activeTextTarget,...(typeof composerChannelMedia!=='undefined'&&composerChannelMedia?captureWorkspaceChannelMedia(composerChannelMedia,$$('#composer-channels input:checked').map(x=>x.value)):{})};}
function canRestoreWorkspace(){return !saving&&!mediaLoading&&!$('#composer').open&&!$('#idea-dialog').open&&!workspacePlannerReading;}
async function refreshWorkspacePlanner(workspace){if(!canRestoreWorkspace())throw Error('Schließe zuerst den aktuellen Editor.');workspacePlannerReading=true;try{const loaded=await store.load();state=normalizeState(loaded);render();const accepts=(type,value)=>{const input=document.createElement('input');input.type=type;input.value=value;return input.value===value;};return workspaceRestoreDecision(workspace,{posts:state.posts,revision:store.plannerRevision,allowedChannels:CHANNELS.map(c=>c.id),isTimeZone,dateAccepts:v=>accepts('date',v),timeAccepts:v=>accepts('time',v)});}finally{workspacePlannerReading=false;}}
function applyWorkspaceRestore(workspace,payload,{asCopy}){if(!asCopy&&payload.schemaVersion!==4&&state.posts.find(p=>p.id===workspace.sourcePostId)?.channelMediaItems)throw Error('Kanalmedien können nicht durch eine frühere Arbeitsfassung ersetzt werden. Als neue Kopie öffnen.');const restoredMedia=workspaceRestoreMedia(workspace,payload),restoredChannels=payload.schemaVersion===4?projectWorkspaceChannelMedia(payload,restoredMedia):null;workspaceRestoring=true;try{openComposer(asCopy?null:workspace.sourcePostId,null,true);videoWorkspaceVersion=payload.schemaVersion===3?3:2;composerLabelState={title:payload.title,tags:[...payload.tags],raw:payload.rawTags,baseline:payload.baselineRenderedTags};$('#post-tags').value=payload.rawTags;$('#composer-labels').open=!!payload.rawTags;composerLabelState.rendered=$('#post-tags').value;composerBaseText=payload.text;composerVariantTexts=structuredClone(payload.variantTexts);renderComposerChannels(payload.channels);activeTextTarget=payload.activeTextTarget;$('#post-text').value=activeTextTarget==='base'?composerBaseText:effectiveText(editorPost(),activeTextTarget);$('#post-date').value=payload.date;$('#post-time').value=payload.time;populateZoneSelect($('#post-zone'),payload.timeZone);composerChannelMedia=restoredChannels;composerImages.reset(restoredChannels?restoredChannels[payload.channels[0]]:restoredMedia);composerMedia=composerImages.selected;composerCover=payload.cover;composerMissingMedia=false;$('#workspace-missing-media').hidden=!composerMissingMedia;composerRestoredWorkspace=true;$('#composer-title').textContent=asCopy?'Arbeitsfassung als neuer Beitrag':'Arbeitsfassung weiterbearbeiten';composerTiming.restore(workspace,payload,{asCopy,source:asCopy?null:state.posts.find(p=>p.id===workspace.sourcePostId)});renderMediaEditor();renderVariantTabs();renderPreview();initialEditor=editorSnapshot();}finally{workspaceRestoring=false;}}
function continueComposerBlocked(){return (typeof composerChannelMedia!=='undefined'&&!!composerChannelMedia)||!$('#composer').open||workspacePlannerReading||workspaceRestoring||splitPending||splitNeedsReload||imageStudio.hasPendingWork||!!document.querySelector('dialog[open]:not(#composer)');}
function continueSavedPostMatches(post){
  const saved=state.posts.find(value=>value.id===post.id);
  const sameChannels=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(id=>typeof id==='string'&&b.includes(id));
  const sameVariants=(a={},b={})=>a!==null&&b!==null&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(id=>Object.hasOwn(b,id)&&typeof a[id]==='string'&&a[id]===b[id]);
  return !!saved&&JSON.stringify(saved.channelMediaItems??null)===JSON.stringify(post.channelMediaItems??null)&&sameChannels(saved.channels,post.channels)&&sameVariants(saved.variantTexts,post.variantTexts)&&saved.mediaItems?.length===post.mediaItems.length&&post.mediaItems.every((item,index)=>{const actual=saved.mediaItems[index];return actual.alt===item.alt&&(!item.id||actual.id===item.id);})&&(!post.scheduledInstant||saved.scheduledInstant===post.scheduledInstant)&&['scheduleBinding','title','tags','text','status','scheduledAt','timeZone','cover'].every(key=>JSON.stringify(saved[key]??null)===JSON.stringify(post[key]??null));
}
async function savePost(status){
  if(typeof channelMediaUI!=='undefined'&&channelMediaUI?.isOpen)return;
  if(saving||mediaLoading||savedAltEdit)return;
  try{const check=originalPreservationController().status(state,state.posts.find(p=>p.id===editingId));if(check.kind==='blocked'){notify(check.message);return;}}catch{/* Ordinary Save remains available when tab storage is disabled and preservation could not start. */}
  const continueAfterSave=status==='scheduled'&&!!$('#continue-composer')?.checked;
  if(continueAfterSave&&continueComposerBlocked())return;
  const submittedGeneration=continueAfterSave?composerGeneration:null;
  if(composerMissingMedia){$('#form-errors').hidden=false;$('#form-errors').textContent='Das Bild aus der Arbeitsfassung fehlt. Wähle es erneut aus oder bestätige bewusst, ohne dieses Bild weiterzuarbeiten.';focusComposerErrors($('#form-errors'));return;}
  const previous=state.posts.find(p=>p.id===editingId),now=new Date().toISOString();
  let initial;try{initial=JSON.parse(initialEditor)}catch{initial={}}
  let tags;try{tags=editedPostLabels(composerLabelState?.tags??previous?.tags,currentComposerRawTags(),composerLabelState?.baseline??initial.tags);}catch(error){$('#composer-labels').open=true;$('#form-errors').hidden=false;$('#form-errors').textContent=error.message;focusComposerErrors($('#form-errors'));return;}
  let timing;try{timing=composerTiming.forSave({status,local:`${$('#post-date').value}T${$('#post-time').value}`,zone:$('#post-zone').value,channels:$$('#composer-channels input:checked').map(i=>i.value)});}catch(error){$('#form-errors').hidden=false;$('#form-errors').textContent=error.message;focusComposerErrors($('#form-errors'));return;}
  const post={...timing,id:editingId||crypto.randomUUID(),title:composerLabelState?.title??previous?.title??'',tags,text:composerBaseText,variantTexts:selectedVariantTexts(composerVariantTexts,$$('#composer-channels input:checked').map(i=>i.value)),channels:$$('#composer-channels input:checked').map(i=>i.value),status,scheduledAt:status==='scheduled'&&$('#post-date').value&&$('#post-time').value?`${$('#post-date').value}T${$('#post-time').value}`:null,timeZone:$('#post-zone').value,mediaItems:typeof composerChannelMedia!=='undefined'&&composerChannelMedia?structuredClone(composerChannelMedia[$$('#composer-channels input:checked')[0]?.value]||[]):composerImages.items,...(typeof composerChannelMedia!=='undefined'&&composerChannelMedia?{channelMediaItems:structuredClone(composerChannelMedia)}:{}),cover:composerCover,createdAt:previous?.createdAt||now,updatedAt:now};
  const errors=validatePost(post);
  if(errors.length){$('#form-errors').hidden=false;$('#form-errors').innerHTML=`<ul>${errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`;focusComposerErrors($('#form-errors'),{errors,post});return;}
  workspaceUI?.beforePostSave();const submittedEditor=editorSnapshot();saving=true;setComposerBusy(true);let success=false;
  try { let posts;if(composerIdeaFingerprint){posts=commitIdeaDraft(state.posts,post,{sourceFingerprint:composerIdeaFingerprint,now,allowedChannels:CHANNELS.map(c=>c.id)});}else{posts=state.posts.filter(p=>p.id!==post.id);posts.push(post);}success=await persist({...state,posts},{requireReceipt:continueAfterSave});if(success)composerIdeaFingerprint=null;}catch(error){$('#form-errors').hidden=false;$('#form-errors').textContent=error.message;notify(error.message);}
  finally { saving=false;setComposerBusy(false); }
  if(!success)focusComposerErrors($('#form-errors'));
  if(success){
    composerRestoredWorkspace=false;
    if(continueAfterSave&&(composerGeneration!==submittedGeneration||continueComposerBlocked()||!continueSavedPostMatches(post))){
      if(composerGeneration===submittedGeneration){editingId=post.id;initialEditor=submittedEditor;workspaceUI?.retainNewerInput?.();}
      notify('Der Speichervorgang ist beendet. Bitte den gespeicherten Stand prüfen; der nächste Beitrag wurde nicht geöffnet.');return;
    }
    // Defense in depth for delayed events: never close over an unsubmitted edit.
    if(editorSnapshot()!==submittedEditor){editingId=post.id;initialEditor=submittedEditor;workspaceUI?.retainNewerInput?.();notify('Die gesendete Fassung wurde gespeichert. Neuere Änderungen sind noch offen.');return;}
    if(previous?.status==='idea'||(status==='draft'&&!post.channels.length)){channel='all';query='';postTag='';$('#search').value='';}
    if(status==='scheduled'){anchor=new Date(`${calendarTime(post,currentZone()).local.slice(0,10)}T12:00`);calendarStatus='all';if(['drafts','ideas'].includes(view))view='calendar';}else view='drafts';
    let workspaceCompleted=false;
    saving=true;setComposerBusy(true);try{workspaceCompleted=await workspaceUI?.afterPostSave();}catch{workspaceCompleted=false;}finally{saving=false;setComposerBusy(false);}
    if(continueAfterSave&&composerGeneration!==submittedGeneration){notify('Der Beitrag ist gespeichert. Der neuere Editor bleibt unverändert.');return;}
    if(workspaceCompleted===false||(continueAfterSave&&workspaceCompleted!==true)){
      editingId=post.id;initialEditor=submittedEditor;if(editorSnapshot()!==submittedEditor)workspaceUI?.retainNewerInput?.();
      notify('Der Beitrag ist gespeichert. Das Schließen der Arbeitsfassung ist noch nicht bestätigt. Bitte die Sicherung prüfen; den Beitrag nicht erneut speichern.');return;
    }
    if(editorSnapshot()!==submittedEditor){editingId=post.id;initialEditor=submittedEditor;workspaceUI?.retainNewerInput?.();notify('Der Beitrag ist gespeichert. Neuere Eingaben bleiben geöffnet und wurden nicht verworfen.');return;}
    if(continueAfterSave){
      if(composerGeneration!==submittedGeneration||continueComposerBlocked()||!$('#continue-composer').checked){editingId=post.id;initialEditor=submittedEditor;notify('Der Beitrag ist gespeichert. Der Editor bleibt geöffnet.');return;}
      closeComposer();render();openComposer(null,null,false,{channels:[...post.channels],timeZone:post.timeZone});
      $('#variant-announcement').textContent='Beitrag lokal eingeplant. Neuer leerer Beitrag. Bitte einen neuen Termin wählen.';
      notify('Beitrag lokal eingeplant. Der nächste Beitrag ist leer; bitte einen neuen Termin wählen.');return;
    }
    closeComposer();render();notify(previous?.status==='idea'?(status==='draft'?'Deine Idee ist jetzt ein Entwurf.':'Deine Idee ist jetzt im Kalender eingeplant.'):(status==='draft'?'Beitrag als Entwurf gespeichert.':'Beitrag eingeplant. Es wird nichts automatisch veröffentlicht.'));
  }
}
async function archivePostAction(action,id=editingId){
 if(saving||mediaLoading||workspacePlannerReading||workspaceRestoring||!plannerLoaded)return;
 const post=state.posts.find(p=>p.id===id);if(!post)return;
 const inComposer=$('#composer').open;
 if(action==='archive'&&(!inComposer||composerRestoredWorkspace||editorSnapshot()!==initialEditor||composerMissingMedia||imageStudio.hasPendingWork)){notify('Änderungen zuerst speichern.');return;}
 if(action==='copy'&&(inComposer||post.status!=='archived'))return;
 const generation=composerGeneration,baseline=inComposer?editorSnapshot():null;let committed=false;
 saving=true;if(inComposer)setComposerBusy(true);
 for(const button of $$('[data-action="copy-archive"]'))button.disabled=true;
 try{
  const result=await store.archiveAction(state,{postId:id,action});
  state=normalizeState(result.state);committed=true;
  if(inComposer&&generation===composerGeneration&&baseline===editorSnapshot())closeComposer();
  else if(inComposer)workspaceUI?.retainNewerInput?.();
  view=action==='copy'?'drafts':'archive';render();notify(action==='copy'?'Neuer Entwurf gespeichert.':'Archiviert.');
  if(action==='copy'){saving=false;openComposer(result.copyId);}
 }catch(error){notify(committed?'Gespeichert. Ansicht neu laden.':error.message||'Archivaktion nicht bestätigt. Neu laden.');}
 finally{saving=false;if(inComposer)setComposerBusy(false);for(const button of $$('[data-action="copy-archive"]'))button.disabled=false;}
}
async function deletePost(){
  if(saving)return;const post=state.posts.find(p=>p.id===editingId);if(!post)return;
  const deletingEditor=editorSnapshot();workspaceUI?.beforePostSave();saving=true;setComposerBusy(true);let success=false;
  try {success=await persist({...state,posts:state.posts.filter(p=>p.id!==post.id)});}finally{saving=false;setComposerBusy(false);}
  if(success){saving=true;setComposerBusy(true);try{await workspaceUI?.afterPostSave();}finally{saving=false;setComposerBusy(false);}if(editorSnapshot()!==deletingEditor){editingId=null;composerIdeaFingerprint=null;workspaceUI?.retainNewerInput?.();notify('Der Beitrag wurde gelöscht. Neuere Eingaben bleiben als noch ungespeicherte neue Kopie geöffnet.');return;}closeComposer();notify('Beitrag gelöscht.',()=>restoreDeletedPost(post));}
}
let originalPreservation=null;
function originalPreservationController(){
 if(!originalPreservation)originalPreservation=createOriginalPreservation({storage:window.sessionStorage,save:next=>store.save(normalizeState(next))});
 return originalPreservation;
}
function isPreservedOriginalCopy(id){try{return originalPreservationController().isOriginalCopy(state,id);}catch{return false;}}
function preservedOriginalLink(){
 try{const found=originalPreservationController().historical(state,editingId);return found?` <button type="button" class="button subtle" data-action="open-preserved-original" data-original-id="${esc(found.copyId)}">Entwurf vor dem Kürzen öffnen</button>`:'';}catch{return '';}
}
async function preserveVideoOriginal(){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
 if(saving||mediaLoading||savedAltEdit)return;
 const output=$('#preserve-original-status');
 const report=message=>{if(output)output.textContent=message;notify(message);};
 let flow;try{flow=originalPreservationController();}catch{report('Sicherung nicht gestartet: Browser-Speicher nicht verfügbar.');return;}
 const post=state.posts.find(p=>p.id===editingId),generation=composerGeneration;
 const context={state,post,clean:editorSnapshot()===initialEditor,restored:composerRestoredWorkspace,busy:false};
 saving=true;setComposerBusy(true);
 try{
  const result=await flow.preserve(context);
  // Verified commit precedes UI work. A render failure must never invite another write.
  state=normalizeState(result.state);if(generation===composerGeneration)composerSavedRevision=state.revision;
  try{render();}catch{}
  if(generation===composerGeneration&&$('#composer').open){
   const status=$('#preserve-original-status');if(status){status.textContent='Original als eigener Entwurf gespeichert. ';const link=document.createElement('button');link.type='button';link.className='button subtle';link.textContent='Entwurf vor dem Kürzen öffnen';link.dataset.action='open-preserved-original';link.dataset.originalId=result.copyId;status.append(link);}
  }
  notify('Original als eigener Entwurf gespeichert. Das aktuelle Video bleibt geöffnet.');
 }catch(error){report(error.message||'Speicherstatus unklar. Bitte neu laden.');}
 finally{saving=false;setComposerBusy(false);}
}
function openPreservedOriginal(id){
 if(saving||mediaLoading)return;
 if(editorSnapshot()!==initialEditor){notify('Aktuelle Änderungen zuerst speichern oder verwerfen.');return;}
 if(!state.posts.some(p=>p.id===id))return;
 closeComposer();openComposer(id);
}
async function duplicatePost(){
  if(saving||mediaLoading)return;const warn=message=>{notify(message);$('#form-errors').textContent=message;$('#form-errors').hidden=false;focusComposerErrors($('#form-errors'));};const post=state.posts.find(p=>p.id===editingId);if(!post)return;
  // A restored workspace has its own clean baseline, but is not the saved post copied below.
  if(composerRestoredWorkspace){warn('Speichere die wiederaufgenommene Arbeitsfassung zuerst als Beitrag, bevor du sie duplizierst.');return;}
  const duplicatingEditor=editorSnapshot();
  if(duplicatingEditor!==initialEditor){warn('Speichere deine Änderungen, bevor du den Beitrag duplizierst.');return;}
  const copy={...duplicateTaktDraft(post,{id:crypto.randomUUID()}),title:post.title||'',tags:[...(post.tags||[])]};
  saving=true;setComposerBusy(true);let success=false;
  try{success=await persist({...state,posts:[...state.posts,copy]});}finally{saving=false;setComposerBusy(false);}
  if(success){
    if(editorSnapshot()!==duplicatingEditor){workspaceUI?.retainNewerInput?.();warn('Eine Kopie der gespeicherten Fassung wurde als Entwurf gespeichert. Deine neueren Eingaben bleiben im ursprünglichen Beitrag geöffnet.');return;}
    closeComposer();view='drafts';render();notify('Eine Kopie wurde als Entwurf gespeichert.');openComposer(copy.id);
  }
}
function draftSplitContext(){
  const workspace=workspaceUI?.controller?.snapshot;
  return {state,postId:editingId,revision:store.plannerRevision,savedRevision:composerSavedRevision,editor:editorSnapshot(),initialEditor,
    open:$('#composer').open,busy:saving||splitPending||splitNeedsReload||workspacePlannerReading||workspaceRestoring||!plannerLoaded||typeof store.splitDraft!=='function',
    restored:composerRestoredWorkspace,localWorkspace:(!(workspace?.unsupportedMedia&&!workspace?.pendingWrite&&!workspace?.workspace)&&(!!workspaceUI?.hasUnsavedLocalInput||!!workspace?.localOnly))||!!workspace?.workspace||workspace?.phase==='checking',
    pendingMedia:mediaLoading||composerMissingMedia||!!composerImages.items.some(item=>item.dataUrl)||imageStudio.hasPendingWork||!!document.querySelector('dialog[open]:not(#composer):not(#channel-split-dialog)')};
}
function updateDraftSplitAvailability(){
  const button=$('#split-draft');if(!button)return;
  button.hidden=!splitDraftEligible(draftSplitContext());button.disabled=saving||splitPending;
}
function closeDraftSplit(){
  if(splitPending)return false;
  splitPreview=null;splitToken++;
  const wasOpen=$('#channel-split-dialog').open;
  if(wasOpen)$('#channel-split-dialog').close();
  if(wasOpen&&$('#composer').open){updateDraftSplitAvailability();const button=$('#split-draft');if(!button.hidden&&!button.disabled)button.focus();else $('#post-text').focus();}
  return true;
}
function openDraftSplit(){
  if(splitPending||$('#channel-split-dialog').open)return;
  const preview=prepareDraftSplit(draftSplitContext(),{generation:composerGeneration,token:++splitToken});
  if(!preview){updateDraftSplitAvailability();return;}
  splitPreview=preview;
  $('#channel-split-count').textContent=`${preview.channels.length} einzelne Entwürfe`;
  $('#channel-split-channels').textContent=preview.channels.map(id=>CHANNELS.find(c=>c.id===id)?.name||id).join(' · ');
  $('#channel-split-confirm').dataset.splitToken=String(preview.token);
  $('#channel-split-confirm').disabled=false;$('#channel-split-cancel').disabled=false;
  $('#channel-split-dialog').showModal();$('#channel-split-cancel').focus();
}
function retainSplitInput(){
  // The old multi-channel form must not overwrite the first new single-channel draft.
  editingId=null;composerIdeaFingerprint=null;composerRestoredWorkspace=true;initialEditor='';
  workspaceUI?.retainNewerInput?.();
  notify('Entwürfe aufgeteilt. Neuere Eingaben bleiben als ungespeicherte neue Kopie geöffnet.');
}
async function confirmDraftSplit(token){
  if(splitPending||!$('#channel-split-dialog').open)return;
  const preview=splitPreview;
  if(!draftSplitMatches(preview,draftSplitContext(),{generation:composerGeneration,token:Number(token)})){
    closeDraftSplit();notify('Der Entwurf wurde geändert. Bitte erneut prüfen.');return;
  }
  // Consume this confirmation before the first await. Closing/reopening cannot reuse it.
  splitPreview=null;splitPending=true;saving=true;setComposerBusy(true);
  $('#channel-split-confirm').disabled=true;$('#channel-split-cancel').disabled=true;
  $('#channel-split-dialog').setAttribute('aria-busy','true');workspaceUI?.beforePostSave();
  let success=false,completionFailed=false;
  try{
    let saved;
    try{saved=await store.splitDraft(structuredClone(state),{postId:preview.postId});success=true;}
    catch(error){
      // Even a rejection requires a fresh load before another split in this session.
      splitNeedsReload=true;
      const message=error?.code==='REVISION_CONFLICT'?'Die Planung wurde inzwischen geändert. Eingabe bleibt erhalten. Bitte neu laden.':error?.message||'Aufteilen nicht bestätigt. Bitte vor weiteren Änderungen neu laden.';
      $('#form-errors').hidden=false;$('#form-errors').textContent=message;notify(message);
    }
    if(success){
      try{
        state=normalizeState(saved);render();
        if(composerGeneration===preview.generation&&$('#composer').open&&editorSnapshot()===preview.editor)await workspaceUI?.afterPostSave();
      }catch{
        // A UI/secondary-workspace failure cannot turn an acknowledged commit into
        // a failed write or authorize a second split. Keep every current input.
        completionFailed=true;splitNeedsReload=true;
      }
    }
  }finally{
    splitPending=false;saving=false;setComposerBusy(false);$('#channel-split-dialog').setAttribute('aria-busy','false');
    closeDraftSplit();updateDraftSplitAvailability();
  }
  if(completionFailed){
    if(composerGeneration===preview.generation&&$('#composer').open){editingId=null;composerIdeaFingerprint=null;composerRestoredWorkspace=true;initialEditor='';workspaceUI?.retainNewerInput?.();}
    const message='Entwürfe gespeichert. Ansicht oder Arbeitsfassung konnte nicht abgeschlossen werden. Eingaben bleiben erhalten. Bitte neu laden.';
    $('#form-errors').hidden=false;$('#form-errors').textContent=message;notify(message);focusComposerErrors($('#form-errors'));return;
  }
  if(!success){focusComposerErrors($('#form-errors'));return;}
  if(composerGeneration!==preview.generation||!$('#composer').open)return;
  if(editorSnapshot()!==preview.editor){retainSplitInput();return;}
  closeComposer();view='drafts';channel='all';query='';postTag='';$('#search').value='';render();notify('Entwürfe nach Kanälen aufgeteilt.');
}
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;hydrateIcons($('#info-content'));if(!$('#info-dialog').open)$('#info-dialog').showModal()}
function showChannels(){showInfo('Deine Planungsziele',`${CHANNELS.map(c=>`<div class="info-channel">${platform(c.id)}<span><strong>${c.name}</strong><small>${esc(c.handle)}</small></span><span class="demo-chip">${c.id==='mastodon'?'Planungsziel':'Beispielprofil'}</span></div>`).join('')}`)}
function showSettings(){const cloud=config.storageMode==='server'&&!localFallback;showInfo('Dein Arbeitsbereich',`<p>${cloud?'':'Speicher nicht verfügbar. Speichern gesperrt.'}</p><h3>Planungszeitzone</h3><select id="settings-timezone" class="settings-zone" aria-label="Standardzeitzone"></select><div class="settings-actions"><button class="button subtle" data-action="connections">Verbindungen ansehen</button><button class="button subtle" data-action="save-timezone">Zeitzone speichern</button><button class="button subtle" data-action="export">${icon('download')}Planung exportieren</button><button class="button subtle" data-action="import-planning">Planung importieren</button></div>`);populateZoneSelect($('#settings-timezone'),currentZone())}
function showHelp(){showInfo('Tastenkürzel',`<ul class="keyboard-list"><li>Neuen Beitrag öffnen <kbd>N</kbd></li><li>Suche fokussieren <kbd>/</kbd></li><li>Dialog schließen <kbd>Esc</kbd></li></ul>`)}
function exportData(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`takt-planung-${dateKey(new Date())}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Planung exportiert. Kein vollständiges Backup: Medien-Dateien, Arbeitsfassungen und Kontozugriffe sind nicht enthalten.')}
async function saveTimezone(){const timezone=$('#settings-timezone').value;if(!isTimeZone(timezone))return;if(await persist({...state,settings:{...state.settings,timezone}})){$('#info-dialog').close();notify(`Zeitzone für neue Beiträge: ${timezone}`)}}
function canChooseSavedText(){return !saving&&!mediaLoading&&!workspacePlannerReading&&!workspaceRestoring&&!splitPending&&$('#composer').open&&!$('#post-text').disabled&&!$('#post-text').readOnly&&!document.querySelector('dialog[open]:not(#composer):not(#saved-text-picker):not(#post-template-picker)');}
function openSavedTexts(mode='saved'){
  if(!canChooseSavedText()||savedTextPicker?.isOpen||postTemplatePicker?.isOpen)return;
  const input=$('#post-text'),target=activeTextTarget,name=CHANNELS.find(channel=>channel.id===target)?.name;
  if(target!=='base'&&!editorPost().channels.includes(target))return;
  savedTextTarget={generation:composerGeneration,editor:editorSnapshot(),target,value:input.value,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,scrollTop:input.scrollTop,scrollLeft:input.scrollLeft,applied:false,
    label:`${target==='base'?'Basistext':`${name} · Eigener Text`} · ${input.selectionStart===input.selectionEnd?'An Textposition einfügen':'Nach Auswahl einfügen'}`};
  if(!(mode==='template'?postTemplatePicker:savedTextPicker).open(savedTextTarget))savedTextTarget=null;
}
function applySavedText(selected,origin){
  const text=resolveSavedText(state,selected,CHANNELS,{available:plannerLoaded&&!localFallback}).replace(/\r\n?/g,'\n');
  return applyComposerText(text,origin);
}
function applyComposerText(text,origin){
  if(!canChooseSavedText()||!origin||origin!==savedTextTarget||origin.applied||origin.generation!==composerGeneration||origin.target!==activeTextTarget||origin.editor!==editorSnapshot()||origin.value!==$('#post-text').value||origin.start!==$('#post-text').selectionStart||origin.end!==$('#post-text').selectionEnd||origin.direction!==$('#post-text').selectionDirection)throw Error('Der Editor hat sich geändert. Öffne die Auswahl erneut.');
  // Keep the saved source/identity raw; textarea insertion uses LF line endings.
  const next=insertSavedText(origin.value,text,origin.end),input=$('#post-text');
  const previousVariants=composerVariantTexts,previousBase=composerBaseText;
  try{
    input.setRangeText(text,origin.end,origin.end,'select');
    if(input.value!==next.text)throw Error('Text insertion failed.');
    if(origin.target==='base')composerBaseText=input.value;else composerVariantTexts={...composerVariantTexts,[origin.target]:input.value};
    renderPreview();origin.applied=true;origin.start=next.start;origin.end=next.end;origin.direction='forward';
    return true;
  }catch{
    composerBaseText=previousBase;composerVariantTexts=previousVariants;input.value=origin.value;input.setSelectionRange(origin.start,origin.end,origin.direction);
    try{renderPreview()}catch{}
    throw Error('Der Text konnte nicht eingefügt werden. Dein bisheriger Text bleibt erhalten.');
  }
}
function closeSavedTexts(origin,{restoreFocus}){
  if(!origin||origin!==savedTextTarget)return;
  savedTextTarget=null;
  if(!restoreFocus||origin.generation!==composerGeneration||!$('#composer').open||activeTextTarget!==origin.target)return;
  const input=$('#post-text');
  if(input.disabled)return;
  // Only restore the old range if no newer editor input has replaced it.
  if(origin.applied||origin.editor===editorSnapshot()&&origin.value===input.value){input.setSelectionRange(origin.start,origin.end,origin.direction);input.scrollTop=origin.scrollTop;input.scrollLeft=origin.scrollLeft;}
  input.focus({preventScroll:true});
}
function canChooseSavedImage(){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;if(savedAltEdit)return false;return !saving&&!mediaLoading&&!workspacePlannerReading&&$('#composer').open&&!document.querySelector('dialog[open]:not(#composer):not(#saved-image-picker)');}
function openSavedImages(){
  if(!canChooseSavedImage()||savedImagePicker?.isOpen)return;
  savedImageTarget={ticket:composerImages.ticket('add'),generation:composerGeneration,media:composerMedia,mediaState:composerMedia?{...composerMedia}:null,cover:composerCover,missing:composerMissingMedia};
  savedImagePicker.open({intent:savedImageTarget.ticket.intent,remaining:10-composerImages.length});
}
async function applySavedImage(selected,{signal}={}){
  const origin=savedImageTarget;
  if(!plannerLoaded||localFallback||!canChooseSavedImage()||!origin||signal?.aborted)throw Error('Der Editor ist nicht mehr für diese Bildauswahl verfügbar. Öffne die Auswahl erneut.');
  const unchanged=()=>composerImages.current(origin.ticket)&&origin===savedImageTarget&&origin.generation===composerGeneration&&composerMedia===origin.media&&Object.keys(composerMedia||{}).length===Object.keys(origin.mediaState||{}).length&&Object.entries(origin.mediaState||{}).every(([key,value])=>composerMedia?.[key]===value)&&composerCover===origin.cover&&composerMissingMedia===origin.missing&&$('#composer').open&&!signal?.aborted;
  if(!unchanged())throw Error('Der Beitrag oder sein Bild wurde inzwischen geändert. Öffne die Auswahl erneut.');
  const selection=(Array.isArray(selected)?selected:[selected]).map(item=>({...item}));
  if(!selection.length||selection.length>(origin.ticket.intent==='add'?10-composerImages.length:1)||new Set(selection.map(item=>item?.id)).size!==selection.length)throw Error('Ungültige Bildauswahl.');
  const resolveAll=()=>{
    const existing=new Set(composerImages.rows.filter(row=>origin.ticket.intent!=='replace'||row.key!==origin.ticket.target).map(row=>row.media?.id).filter(id=>typeof id==='string'));
    if(selection.some(item=>existing.has(item.id)))throw Error('Dieses Bild ist bereits im Beitrag enthalten.');
    return selection.map(item=>resolveSavedImage(state,item,{available:plannerLoaded&&!localFallback}));
  };
  const media=resolveAll(),session=composerGeneration,generation=++mediaGeneration;
  const current=()=>session===composerGeneration&&generation===mediaGeneration;
  const previousImages=composerImages.checkpoint();let adopted=null,committed=false;mediaLoading=true;updateSaveAvailability();
  try{
    for(const item of media){
      if(!current()||!unchanged()||saving)throw Error('Die Bildauswahl wurde inzwischen geändert.');
      resolveAll();
      await decodeSavedImage(item,{signal});
      if(!current()||!unchanged()||saving)throw Error('Die Bildauswahl wurde inzwischen geändert.');
      resolveAll();
    }
    if(!current()||!unchanged()||saving)throw Error('Die Bildauswahl wurde inzwischen geändert.');
    await prepareMediaCommit(origin.ticket);if(!current()||!unchanged()||saving)throw Error('Die Bildauswahl wurde inzwischen geändert.');adopted=resolveAll();composerMedia=origin.ticket.intent==='add'?composerImages.commitMany(origin.ticket,adopted):composerImages.commit(origin.ticket,adopted[0]);committed=true;composerCover=null;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;
    renderMediaEditor();renderPreview();workspaceUI?.captureChanged();
    notify('Gespeichertes Bild übernommen. Speichere den Beitrag, um die Auswahl zu behalten.');
    return true;
  }catch{
    if(committed&&current()&&composerImages.rollback(previousImages)){
      composerMedia=composerImages.selected;composerCover=origin.cover;composerMissingMedia=origin.missing;$('#workspace-missing-media').hidden=!composerMissingMedia;
      try{renderMediaEditor();}catch{}try{renderPreview();}catch{}try{workspaceUI?.captureChanged();}catch{}
    }
    throw Error('Das Bild konnte nicht übernommen werden. Die bisherige Auswahl bleibt erhalten. Öffne die Auswahl bei Bedarf erneut.');
  }finally{if(current()){mediaLoading=false;updateSaveAvailability();}}
}
function cancelSavedAlt(render=true){
  const edit=savedAltEdit;if(!edit)return;savedAltEdit=null;edit.controller.abort();mediaGeneration++;mediaLoading=false;updateSaveAvailability();
  if(render){renderMediaEditor();$('#media-alt')?.focus();}
}
function openSavedAlt(){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  if(savedAltEdit||saving||mediaLoading||!$('#composer').open||!imageAltIsReadOnly(composerMedia))return;
  savedAltEdit={ticket:composerImages.ticket('replace'),media:composerMedia,identity:JSON.stringify(composerMedia),session:composerGeneration,controller:new AbortController(),pending:false};
  const field=$('#media-alt');field.parentElement.querySelector('label').textContent='Alternativtext';field.readOnly=false;field.maxLength=500;field.setAttribute('aria-label','Bildbeschreibung ändern');
  const actions=document.createElement('div');actions.id='saved-alt-actions';actions.innerHTML='<button type="button" class="button subtle" data-action="cancel-saved-alt">Abbrechen</button><button type="button" class="button primary" data-action="apply-saved-alt">Übernehmen</button><span id="saved-alt-error" role="alert"></span>';
  field.parentElement.append(actions);$('#media-editor [data-action="edit-saved-alt"]').hidden=true;updateSaveAvailability();field.focus();
}
async function applySavedAlt(){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  const edit=savedAltEdit;if(!edit||edit.pending||saving||mediaLoading)return;
  const alt=$('#media-alt').value;
  if(alt===edit.media.alt){cancelSavedAlt();return;}
  const current=()=>composerImages.current(edit.ticket)&&savedAltEdit===edit&&composerGeneration===edit.session&&composerMedia===edit.media&&JSON.stringify(composerMedia)===edit.identity&&$('#composer').open&&!edit.controller.signal.aborted;
  if(!current()){cancelSavedAlt();return;}
  edit.pending=true;mediaLoading=true;updateSaveAvailability();$('#media-alt').readOnly=true;$('#saved-alt-actions [data-action="apply-saved-alt"]').disabled=true;
  try{
    const file=await copySavedImage(edit.media,alt,{signal:edit.controller.signal});
    if(!current())return;
    if(!await readMedia(file,alt,current,edit.ticket))throw Error('Die Beschreibung konnte nicht übernommen werden.');
    if(savedAltEdit===edit){savedAltEdit=null;edit.controller.abort();mediaLoading=false;updateSaveAvailability();}
  }catch(error){if(current()){if($('#saved-alt-error'))$('#saved-alt-error').textContent=error.message||'Die Beschreibung konnte nicht übernommen werden.';}}
  finally{if(savedAltEdit===edit){edit.pending=false;mediaLoading=false;updateSaveAvailability();$('#media-alt').readOnly=false;const button=$('#saved-alt-actions [data-action="apply-saved-alt"]');if(button)button.disabled=false;}}
}
// Reads never renew a ticket: outside edits must invalidate an open studio.
function imageStudioSnapshot(){
  if(imageStudioGeneration!==composerGeneration||!$('#composer').open||!composerImages.current(imageStudioTicket)||composerMedia!==imageStudioTarget)return null;
  return {items:composerImages.rows,key:composerImages.selectedKey};
}
function selectStudioImage(key){
  if(saving||mediaLoading||!imageStudioSnapshot())return false;
  if(!composerImages.rows.some(row=>row.key===key))return false;
  if(key===composerImages.selectedKey)return true;
  // Preserve media references as well as position if rendering the selection fails.
  const checkpoint=composerImages.checkpoint();checkpoint.rows=composerImages.rows;
  if(!composerImages.select(key))return false;
  try{
    composerMedia=composerImages.selected;renderMediaEditor();renderPreview();
    imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;
    return true;
  }catch{
    if(composerImages.rollback(checkpoint)){
      composerMedia=composerImages.selected;imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;
      try{renderMediaEditor();}catch{}try{renderPreview();}catch{}
    }
    return false;
  }
}
function openImageStudio(edit=false){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  if(savedAltEdit||saving||mediaLoading||!$('#composer').open)return;
  if(composerImages.items.some(isVideoMedia)){notify('Entferne zuerst das Video, bevor du Bilder hinzufügst.');return;}
  imageStudioTicket=composerImages.ticket(edit?'replace':'add');imageStudioTarget=composerMedia;imageStudioGeneration=composerGeneration;
  return imageStudio.open(edit?composerMedia:null,{carousel:edit});
}
async function applyEditedImage(file,alt,options={}){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  // Capture before any asynchronous work; a later selection must not redirect an apply.
  const ticket=imageStudioTicket,target=imageStudioTarget,session=imageStudioGeneration;
  const current=()=>imageStudioTicket===ticket&&composerImages.current(ticket)&&session===composerGeneration&&composerMedia===target&&$('#composer').open;
  if(saving||mediaLoading||!current())throw Error('Der Beitrag oder sein Bild wurde inzwischen geändert. Öffne den Bildeditor erneut.');
  if(options.unchanged&&ticket.intent==='replace'&&target){
    if(alt===target.alt)return;
    if(typeof alt!=='string'||alt.length>500)throw Error('Die Bildbeschreibung darf höchstens 500 Zeichen haben.');
    if(imageAltIsReadOnly(target)){
      // Saved bytes stay untouched. Only a local byte-identical copy is prepared.
      const generation=++mediaGeneration;mediaLoading=true;updateSaveAvailability();
      try{
        file=await copySavedImage(target,alt);
        if(!current()||generation!==mediaGeneration)throw Error('Der Beitrag oder sein Bild wurde inzwischen geändert. Öffne den Bildeditor erneut.');
      }finally{if(session===composerGeneration&&generation===mediaGeneration){mediaLoading=false;updateSaveAvailability();}}
    }else{
      const previousImages=composerImages.checkpoint();previousImages.rows=composerImages.rows;let committed=false;
      try{composerMedia=composerImages.commit(ticket,{...target,alt});committed=true;renderMediaEditor();renderPreview();workspaceUI?.captureChanged();}
      catch(error){
        if(committed&&imageStudioTicket===ticket&&session===composerGeneration&&composerImages.rollback(previousImages)){
          composerMedia=composerImages.selected;imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;
          try{renderMediaEditor();}catch{}try{renderPreview();}catch{}try{workspaceUI?.captureChanged();}catch{}
        }
        throw error;
      }
      if(imageStudioTicket===ticket&&session===composerGeneration){imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;}
      return;
    }
  }
  const rolledBack=()=>{if(imageStudioTicket===ticket&&session===composerGeneration&&composerMedia===target){imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;}};
  if(!current()||!await readMedia(file,alt,current,ticket,rolledBack))throw Error('Das Bild konnte nicht übernommen werden. Die bisherige Auswahl bleibt unverändert.');
  // Only an acknowledged commit renews the target for subsequent carousel edits.
  if(imageStudioTicket===ticket&&session===composerGeneration){imageStudioTicket=composerImages.ticket('replace');imageStudioTarget=composerMedia;}
}
async function prepareMediaCommit(ticket){if(!composerImages.current(ticket))throw Error('Die Bildauswahl wurde inzwischen geändert.');if(ticket.intent==='add'&&composerImages.length>=10)throw Error('Ein Beitrag erlaubt höchstens 10 Bilder.');if(!composerImages.current(ticket))throw Error('Die Bildauswahl wurde inzwischen geändert.');}
function invalidatePendingImageBatch(){
  if(mediaBatchGeneration!==mediaGeneration)return;
  mediaBatchGeneration=null;mediaGeneration++;mediaLoading=false;updateSaveAvailability();updateDraftSplitAvailability();
}
async function readMediaBatch(files){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  // Snapshot synchronously: resetting the input or a later picker cannot change this batch.
  const selected=Array.from(files||[]);
  if(!selected.length||saving)return false;
  cancelSavedAlt();
  const ticket=composerImages.ticket('add'),checkpoint=composerImages.checkpoint();
  const previousCover=composerCover,previousMissingMedia=composerMissingMedia;
  const session=composerGeneration,generation=++mediaGeneration;
  const active=()=>session===composerGeneration&&generation===mediaGeneration&&$('#composer').open;
  const current=()=>active()&&composerImages.current(ticket);
  let committed=false;mediaBatchGeneration=generation;
  mediaLoading=true;updateSaveAvailability();updateDraftSplitAvailability();
  try{
    const items=await prepareImageBatch(selected,{count:composerImages.length,current});
    if(!items||!current())return false;
    composerMedia=composerImages.commitMany(ticket,items);committed=true;
    composerCover=null;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;
    renderMediaEditor();renderPreview();$('#media-alt')?.focus();
    return true;
  }catch(error){
    if(active()){
      if(committed&&composerImages.rollback(checkpoint)){
        composerMedia=composerImages.selected;composerCover=previousCover;composerMissingMedia=previousMissingMedia;
        $('#workspace-missing-media').hidden=!composerMissingMedia;
        try{renderMediaEditor();}catch{}try{renderPreview();}catch{}
      }
      if(committed||composerImages.current(ticket))notify(error.message||'Die Bilder konnten nicht hinzugefügt werden.');
    }
    return false;
  }finally{if(active()){mediaBatchGeneration=null;mediaLoading=false;updateSaveAvailability();updateDraftSplitAvailability();}}
}
async function readMedia(file,alt='',stillCurrent=()=>true,ticket=composerImages.ticket('add'),onRollback=()=>{}){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
  if(!file||saving)return false;
  const previousImages=composerImages.checkpoint(),previousMedia=composerMedia,previousCover=composerCover,previousMissingMedia=composerMissingMedia;previousImages.rows=composerImages.rows;let committed=false;
  const session=composerGeneration,generation=++mediaGeneration;
  const active=()=>session===composerGeneration&&generation===mediaGeneration&&$('#composer').open;
  mediaLoading=false;updateSaveAvailability();
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('Bitte wähle ein JPG-, PNG- oder WebP-Bild.');return false;}
  if(!Number.isFinite(file.size)||file.size<=0||file.size>2*1024*1024){notify('Bitte wähle ein Bild mit höchstens 2 MB.');return false;}
  if(typeof alt!=='string'||alt.length>500){notify('Die Bildbeschreibung darf höchstens 500 Zeichen haben.');return false;}
  mediaLoading=true;updateSaveAvailability();
  try{
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();let settled=false;
      const finish=(error,abort=false)=>{if(settled)return;settled=true;clearTimeout(timer);reader.onload=null;reader.onerror=null;reader.onabort=null;if(abort){try{reader.abort?.();}catch{}}error?reject(error):resolve(reader.result);};
      const timer=setTimeout(()=>finish(Error('Das Bild konnte nicht rechtzeitig gelesen werden.'),true),15000);
      reader.onload=()=>finish();reader.onerror=()=>finish(Error('Das Bild konnte nicht gelesen werden.'));reader.onabort=()=>finish(Error('Dateiauswahl wurde abgebrochen.'));
      try{reader.readAsDataURL(file);}catch(error){finish(error);}
    });
    if(!active()||!stillCurrent()||!composerImages.current(ticket))return false;
    await new Promise((resolve,reject)=>{
      const img=new Image();let settled=false;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);img.onload=null;img.onerror=null;if(error){img.src='';reject(error);}else resolve();};
      const timer=setTimeout(()=>finish(Error('Das Bild konnte nicht rechtzeitig geladen werden.')),15000);
      img.onload=()=>finish(!Number.isInteger(img.naturalWidth)||!Number.isInteger(img.naturalHeight)||img.naturalWidth<=0||img.naturalHeight<=0||img.naturalWidth>16384||img.naturalHeight>16384||img.naturalWidth*img.naturalHeight>40_000_000?Error('Dieses Bild ist zu groß oder kann nicht gelesen werden.'):null);img.onerror=()=>finish(Error('Dieses Bild konnte nicht geladen werden.'));
      try{img.src=dataUrl;}catch(error){finish(error);}
    });
    if(!active()||!stillCurrent()||!composerImages.current(ticket))return false;
    await prepareMediaCommit(ticket);if(!active()||!stillCurrent())return false;composerMedia=composerImages.commit(ticket,{dataUrl,name:file.name,type:file.type,alt});committed=true;composerCover=null;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;renderMediaEditor();renderPreview();workspaceUI?.captureChanged();$('#media-alt').focus();return true;
  }catch(error){if(active()){if(committed&&composerImages.rollback(previousImages)){composerMedia=composerImages.selected;composerCover=previousCover;composerMissingMedia=previousMissingMedia;$('#workspace-missing-media').hidden=!composerMissingMedia;onRollback();try{renderMediaEditor();}catch{}try{renderPreview();}catch{}try{workspaceUI?.captureChanged();}catch{}}notify(error.message||'Dieses Bild konnte nicht geladen werden. Wähle eine andere Datei.');}return false;}
  finally{if(active()){mediaLoading=false;updateSaveAvailability();$('#media-file').value='';}}
}
function openVideoTail(mode='tail'){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
 if(saving||mediaLoading||savedAltEdit||!$('#composer').open||composerImages.length!==1||!['video/webm','video/mp4'].includes(composerMedia?.type)||document.querySelector('dialog[open]:not(#composer)'))return;
 if(mode==='start'&&composerMedia.type!=='video/mp4')return;
 const target={session:composerGeneration,ticket:composerImages.ticket('replace'),identity:JSON.stringify(composerMedia),checkpoint:composerImages.checkpoint(),cover:composerCover,missing:composerMissingMedia};
 videoTailTarget=target;
 for(const video of $$('#composer video'))video.pause();
 const current=()=>videoTailTarget===target&&target.session===composerGeneration&&$('#composer').open&&composerImages.current(target.ticket)&&JSON.stringify(composerImages.selected)===target.identity;
 void (mode==='start'?videoTailEditor.openStart(composerMedia,{isCurrent:current}):videoTailEditor.open(composerMedia,{isCurrent:current}));
}
function applyVideoTail(media){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
 const target=videoTailTarget;
 if(!target||saving||target.session!==composerGeneration||!$('#composer').open||!composerImages.current(target.ticket)||JSON.stringify(composerImages.selected)!==target.identity)throw Error('Der ursprüngliche Videostand wurde geändert. Bitte erneut öffnen.');
 let committed=false;
 try{composerMedia=composerImages.commit(target.ticket,media);committed=true;composerCover=null;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;renderMediaEditor();renderPreview();}
 catch(error){if(committed&&composerImages.rollback(target.checkpoint)){composerMedia=composerImages.selected;composerCover=target.cover;composerMissingMedia=target.missing;$('#workspace-missing-media').hidden=!target.missing;try{renderMediaEditor();renderPreview();}catch{}}throw error;}
 videoTailTarget=null;
}
async function readVideo(file){if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia)return false;
 if(!file||saving||mediaLoading||savedAltEdit||!$('#composer').open)return false;
 if(composerImages.length){notify('Entferne zuerst die vorhandenen Medien. Ein Beitrag enthält ein Video oder Bilder.');return false;}
 const session=composerGeneration,generation=++mediaGeneration,ticket=composerImages.ticket('add');
 const checkpoint=composerImages.checkpoint(),previousCover=composerCover,previousMissing=composerMissingMedia;let committed=false;
 const controller=new AbortController();videoSelectionController?.abort();videoSelectionController=controller;
 const current=()=>!controller.signal.aborted&&session===composerGeneration&&generation===mediaGeneration&&$('#composer').open&&composerImages.current(ticket);
 mediaLoading=true;updateSaveAvailability();updateDraftSplitAvailability();
 try{const item=await prepareComposerVideo(file,{current,signal:controller.signal});if(!item||!current())return false;
 await prepareMediaCommit(ticket);if(!current())return false;
 composerMedia=composerImages.commit(ticket,item);committed=true;composerCover=null;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;
 renderMediaEditor();renderPreview();$('#media-alt').focus();return true;
 }catch(error){if(session===composerGeneration&&generation===mediaGeneration&&$('#composer').open){if(committed&&composerImages.rollback(checkpoint)){composerMedia=composerImages.selected;composerCover=previousCover;composerMissingMedia=previousMissing;$('#workspace-missing-media').hidden=!previousMissing;try{renderMediaEditor();renderPreview();}catch{}}notify(error.message||'Video konnte nicht geladen werden.');}return false;}
 finally{if(videoSelectionController===controller)videoSelectionController=null;if(session===composerGeneration&&generation===mediaGeneration){mediaLoading=false;updateSaveAvailability();updateDraftSplitAvailability();}$('#video-file').value='';}
}
function goView(next){ideaReuseNavigation++;const fromMore=$('#more-dialog').open;if(fromMore)$('#more-dialog').close();queueCalendarReturnDay=null;view=next;render();history.replaceState(null,'',`#${view}`);if(fromMore)$('#page-title').focus();}
function openQueueCalendar(button){
  if(view!=='queue'||!plannerLoaded||saving||workspacePlannerReading||!button?.isConnected||!$('#content').contains(button)||document.querySelector('dialog[open]'))return;
  const key=button.dataset.queueDay,day=queueCalendarDay(key);
  if(!day)return;
  // Recheck current filters and planning, so a removed or time-stale row cannot navigate.
  try{if(!channelQueue(state,{channel,query,tag:postTag,status:queueStatus}).rows.some(post=>post.calendarTime?.local.slice(0,10)===key))return;}catch{return;}
  try{history.pushState(null,'','#calendar');}catch{return;}
  anchor=day;range='week';calendarStatus=queueStatus;goView('calendar');
  queueCalendarReturnDay=key;$('#period-title').focus();
}
function openQueuePriority(button){
  if(view!=='queue'||!plannerLoaded||localFallback||saving||workspacePlannerReading||mediaLoading||channel==='all'||!button?.isConnected||!$('#content').contains(button)||document.querySelector('dialog[open]'))return;
  const post=state.posts.find(item=>item.id===button.dataset.queuePriority);
  if(!queuePriorityAvailable(state,post,channel)||!channelQueue(state,{channel,query,tag:postTag,status:queueStatus}).rows.some(item=>item.id===post.id))return;
  queuePriorityUI?.open(post.id,channel);
}
document.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(typeof composerChannelMedia!=='undefined'&&composerChannelMedia&&(['remove-media','move-media-left','move-media-right','remove-variant-channel','edit-image','edit-saved-alt','apply-saved-alt','trim-video-start','trim-video-tail'].includes(button.dataset.action)||button.dataset.mediaKey))return;if(button.dataset.mediaKey){if(saving||(mediaLoading&&mediaBatchGeneration!==mediaGeneration)||savedAltEdit)return;invalidatePendingImageBatch();composerImages.select(button.dataset.mediaKey);refreshMediaFocus();return;}if(button.dataset.ideaId){openIdea(button.dataset.ideaId);return}if(button.dataset.prepareIdea){beginIdeaPost(button.dataset.prepareIdea);return}if(button.dataset.reuseIdea){await ideaReuseUI?.run(button.dataset.reuseIdea);return}if(button.dataset.composerFocus){if(saving||mediaLoading||!$('#composer').open)return;const target=button.dataset.composerFocus==='date'?$('#post-date'):button.dataset.composerFocus==='channels'?$('#composer-channels input'):null;if(target&&!target.disabled){target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'});}return;}if(button.dataset.textTarget){switchTextTarget(button.dataset.textTarget,button.classList.contains('channel-check'));return}if(button.dataset.homeExpand){const key=button.dataset.homeExpand;if(['upcoming','overdue','review','drafts'].includes(key)){homeExpanded.has(key)?homeExpanded.delete(key):homeExpanded.add(key);render();$(`[data-home-expand="${key}"]`)?.focus();}return;}if(button.dataset.homeView){channel='all';query='';postTag='';ideaTag='';calendarStatus='all';$('#search').value='';anchor=startOfWeek(zonedNow(currentZone()));goView(button.dataset.homeView);return;}if(button.dataset.view){goView(button.dataset.view);return}if(button.dataset.queuePriority){openQueuePriority(button);return}if(button.dataset.postId){openComposer(button.dataset.postId);return}if(button.dataset.newDate){openComposer(null,button.dataset.newDate);return}if(button.dataset.channel){channel=channel===button.dataset.channel?'all':button.dataset.channel;goView('queue');return}if(button.dataset.range){range=button.dataset.range;render();return}switch(button.dataset.action){case'edit-channel-media':channelMediaUI?.open();break;case'previous-channel-media':case'next-channel-media':{const id=$('#preview-channel').value,items=composerChannelMedia?.[id]||[];channelPreviewIndex[id]=Math.max(0,Math.min(items.length-1,(channelPreviewIndex[id]||0)+(button.dataset.action==='previous-channel-media'?-1:1)));renderPreview(id);break;}case'date-shift':dateShiftUI?.open(periodPosts(relevantPosts()).map(post=>post.id));break;case'queue-calendar':openQueueCalendar(button);break;case'find-posting-time':if(!saving&&!mediaLoading&&queuePanel?.openSearch())$('#queue-panel').scrollIntoView({block:'nearest',behavior:'instant'});break;case'review-posting-times':if(!saving&&!mediaLoading&&state.channels.some(c=>c.id===button.dataset.reviewChannel))postingTimesUI?.open(button.dataset.reviewChannel);break;case'queue-clear':query='';postTag='';$('#search').value='';render();$('#search').focus();break;case'queue-drafts':query='';postTag='';$('#search').value='';goView('drafts');break;case'queue-times':postingTimesUI?.open(channel==='all'?null:channel);break;case'return-drafts':returnDraftsUI?.open(channelQueue(state,{channel,query,tag:postTag,status:queueStatus}).rows.map(post=>post.id));break;case'queue-swap':queueSwapUI?.open(channelQueue(state,{channel,query,tag:postTag,status:queueStatus}).rows.map(post=>post.id),channel);break;case'queue-reflow':queueReflowUI?.open(channel);break;case'new-idea':openIdea();break;case'ask-delete-idea':showInfo('Idee löschen?',`<p>Die gespeicherte Idee und ungespeicherte Änderungen werden entfernt. Du kannst die gespeicherte Idee anschließend kurz über „Rückgängig“ wiederherstellen.</p><div class="settings-actions"><button class="button subtle" data-action="close-info">Idee behalten</button><button class="button primary" data-action="delete-idea-confirm">Idee löschen</button></div>`);break;case'delete-idea-confirm':await deleteIdea();break;case'close-idea':askDiscardIdea();break;case'discard-idea':closeIdea();break;case'clear-idea-filters':ideaTag='';query='';$('#search').value='';render();break;case'reset-variant-confirm':{const id=button.dataset.variantChannel;delete composerVariantTexts[id];$('#info-dialog').close();switchTextTarget(id,true);$('#variant-announcement').textContent=`${CHANNELS.find(c=>c.id===id).name} verwendet wieder den Basistext.`;break}case'remove-variant-channel':{const id=button.dataset.variantChannel;delete composerVariantTexts[id];const input=$(`#composer-channels input[value="${id}"]`);if(input)input.checked=false;$('#info-dialog').close();switchTextTarget('base',true);$('#variant-announcement').textContent='Kanal und eigener Text entfernt.';break}case'manual-time':manualComposerTime();break;case'new-post':openComposer();break;case'new-draft':openComposer(null,null,true);break;case'replace-drafts':draftReplaceUI?.open(relevantPosts().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(post=>post.id));break;case'label-drafts':draftLabelsUI?.open(relevantPosts().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(post=>post.id));break;case'archive-drafts':archiveDraftsUI?.open(relevantPosts().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(post=>post.id));break;case'batch-drafts':draftBatchUI?.open(relevantPosts().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(post=>post.id));break;case'mastodon-handoff':{try{if(saving||mediaLoading||editorSnapshot()!==initialEditor)throw Error('Bitte Änderungen zuerst speichern und den gespeicherten Beitrag erneut öffnen.');savedMastodonText(state,{id:editingId,revision:state.revision});const target='/mastodon-publish.html'+handoffReference(editingId,state.revision);window.open(target,'_blank','noopener,noreferrer');}catch(error){$('#form-errors').textContent=error.message;$('#form-errors').hidden=false;focusComposerErrors($('#form-errors'));}break;}case'close-composer':askDiscard();break;case'close-info':$('#info-dialog').close();break;case'discard-composer':closeComposer();break;case'channels':showChannels();break;case'connections':if($('#info-dialog').open)$('#info-dialog').close();goView('connections');break;case'settings':if(button.closest?.('.mobile-nav')){$('#more-dialog').showModal();}else{if($('#more-dialog').open)$('#more-dialog').close();showSettings();}break;case'close-more':$('#more-dialog').close();break;case'help':showHelp();break;case'preserve-video-original':await preserveVideoOriginal();break;case'open-preserved-original':openPreservedOriginal(button.dataset.originalId);break;case'trim-video-start':openVideoTail('start');break;case'trim-video-tail':openVideoTail();break;case'edit-saved-alt':openSavedAlt();break;case'cancel-saved-alt':cancelSavedAlt();break;case'apply-saved-alt':await applySavedAlt();break;case'edit-image':cancelSavedAlt();openImageStudio(true);break;case'previous-media':case'next-media':case'move-media-left':case'move-media-right':{if(saving||(mediaLoading&&mediaBatchGeneration!==mediaGeneration)||savedAltEdit)break;invalidatePendingImageBatch();const direction=['previous-media','move-media-left'].includes(button.dataset.action)?-1:1;if(button.dataset.action.startsWith('move'))composerImages.move(direction);else{const row=composerImages.rows[composerImages.index+direction];if(row)composerImages.select(row.key);}refreshMediaFocus(button.dataset.action);break;}case'remove-media':if(saving||(mediaLoading&&mediaBatchGeneration!==mediaGeneration))break;invalidatePendingImageBatch();cancelSavedAlt(false);composerMissingMedia=false;$('#workspace-missing-media').hidden=true;mediaGeneration++;mediaLoading=false;updateSaveAvailability();composerImages.remove();composerMedia=composerImages.selected;composerCover=null;refreshMediaFocus();break;case'archive-post':await archivePostAction('archive');break;case'copy-archive':await archivePostAction('copy',button.dataset.archiveId);break;case'delete-post':await deletePost();break;case'duplicate-post':await duplicatePost();break;case'split-draft':openDraftSplit();break;case'cancel-draft-split':closeDraftSplit();break;case'confirm-draft-split':await confirmDraftSplit(button.dataset.splitToken);break;case'export':exportData();break;case'import-planning':if($('#info-dialog').open)$('#info-dialog').close();plannerImportUI?.open();break;case'save-timezone':await saveTimezone();break;case'clear-filters':channel='all';query='';postTag='';calendarStatus='all';$('#calendar-status').value='all';$('#search').value='';render();break}});
$('#composer-form').addEventListener('submit',e=>{e.preventDefault();savePost('scheduled')});$('#save-draft').addEventListener('click',()=>savePost('draft'));$('#post-text').addEventListener('input',handleTextInput);$('#composer-channels').addEventListener('change',handleChannelChange);$('#preview-channel').addEventListener('change',()=>renderPreview());$('#reset-variant').addEventListener('click',askResetVariant);$('#media-editor').addEventListener('input',e=>{if(!composerChannelMedia&&e.target.id==='media-alt'&&!imageAltIsReadOnly(composerMedia)){invalidatePendingImageBatch();composerImages.updateAlt(e.target.value);composerMedia=composerImages.selected;renderPreview()}});$('#add-video').addEventListener('click',()=>{if(!composerChannelMedia&&!saving&&!mediaLoading)$('#video-file').click();});$('#video-file').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';void readVideo(file);});$('#add-media').addEventListener('click',()=>openImageStudio());$('#add-media-batch').addEventListener('click',()=>{if(!composerChannelMedia&&!saving)$('#media-files').click();});$('#media-files').addEventListener('change',e=>{const files=Array.from(e.target.files||[]);e.target.value='';void readMediaBatch(files);});$('#media-file').addEventListener('change',e=>{cancelSavedAlt();readMedia(e.target.files[0]);});$('#composer').addEventListener('cancel',e=>{if(e.target!==$('#composer'))return;e.preventDefault();askDiscard()});$('#composer').addEventListener('click',e=>{if(e.target===$('#composer')){const rect=$('#composer').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)askDiscard()}});$('#search').addEventListener('input',e=>{query=e.target.value;render()});$('#post-label-filter').addEventListener('change',e=>{postTag=e.target.value===''?'':JSON.parse(e.target.value);render()});$('#channel-filter').addEventListener('change',e=>{channel=e.target.value;render()});$('#calendar-status').addEventListener('change',event=>{calendarStatus=event.target.value;render()});$('#jump-date').addEventListener('change',event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)){anchor=new Date(`${event.target.value}T12:00`);render()}});$('#today').addEventListener('click',()=>{anchor=zonedNow(currentZone());render()});$('#previous').addEventListener('click',()=>{if(range==='week')anchor=addDays(anchor,-7);else anchor=new Date(anchor.getFullYear(),anchor.getMonth()-1,1);render()});$('#next').addEventListener('click',()=>{if(range==='week')anchor=addDays(anchor,7);else anchor=new Date(anchor.getFullYear(),anchor.getMonth()+1,1);render()});$('#toast-close').addEventListener('click',()=>{$('#toast').hidden=true;undoAction=null});$('#toast-undo').addEventListener('click',async()=>{const action=undoAction;undoAction=null;$('#toast').hidden=true;if(action)await action()});document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||$('#composer').open||$('#idea-dialog').open||$('#info-dialog').open||$('#more-dialog').open||$('#workspace-dialog').open||$('#posting-times-dialog').open||$('#planner-import-dialog').open||$('#calendar-reschedule-dialog').open||$('#return-drafts-dialog').open||$('#draft-replace-dialog').open||$('#draft-labels-dialog').open||$('#archive-drafts-dialog').open||$('#draft-batch-dialog').open||$('#queue-reflow-dialog').open||$('#queue-swap-dialog').open||$('#queue-priority-dialog').open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.key.toLowerCase()==='n'){e.preventDefault();if(view==='ideas')openIdea();else openComposer()}if(e.key==='/'){e.preventDefault();$('#search').focus()}});window.addEventListener('beforeunload',e=>{if(splitPending||imageStudio.hasPendingWork||postingTimesUI?.dirty||($('#composer').open&&(workspaceUI?.hasUnsavedLocalInput||initialEditor!==editorSnapshot()))||($('#idea-dialog').open&&initialIdeaEditor!==ideaEditorSnapshot())){e.preventDefault();e.returnValue=''}});
$('#draft-grouping').addEventListener('change',event=>{if(view!=='drafts'||!['none','labels'].includes(event.target.value))return;draftGrouping=event.target.value;render();$('#draft-grouping').focus();});
$('#idea-form').addEventListener('submit',e=>{e.preventDefault();saveIdea()});$('#prepare-idea').addEventListener('click',()=>saveIdea(true));$('#idea-dialog').addEventListener('cancel',e=>{e.preventDefault();askDiscardIdea()});document.addEventListener('change',e=>{if(e.target.id==='queue-status'&&Object.hasOwn(QUEUE_STATUSES,e.target.value)){queueStatus=e.target.value;render();$('#queue-status')?.focus();return;}if(e.target.id==='idea-label-filter'){ideaTag=e.target.value===''?'':JSON.parse(e.target.value);render()}});
hydrateIcons();
const zoneField=document.createElement('div');zoneField.className='zone-picker';zoneField.innerHTML='<label for="post-zone">Zeitzone</label><select id="post-zone" aria-label="Planungszeitzone"></select>';$('#schedule-timezone').before(zoneField);$('#post-zone').addEventListener('change',()=>{$('#post-date').min=dateKey(zonedNow($('#post-zone').value));composerTimeChanged();renderPreview()});
queuePanel=createSavedQueuePanel({
  container:$('#queue-panel'),getState:()=>state,isBusy:()=>saving||mediaLoading,
  getPost:()=>({...editorPost(),id:editingId||`composer-${composerGeneration}`,status:state.posts.find(p=>p.id===editingId)?.status||'draft',scheduledAt:$('#post-date').value&&$('#post-time').value?`${$('#post-date').value}T${$('#post-time').value}`:null,timeZone:$('#post-zone').value,mediaItems:composerImages.items,cover:composerCover,...composerTiming.snapshot}),
  onSettings:()=>postingTimesUI?.open(state.channels.find(c=>editorPost().channels.includes(c.id)&&!c.postingSchedule)?.id||editorPost().channels[0]),
  onApply:post=>{$('#calendar-reschedule-summary').hidden=true;composerTiming.select(post);$('#post-date').value=post.scheduledAt.slice(0,10);$('#post-time').value=post.scheduledAt.slice(11);populateZoneSelect($('#post-zone'),post.timeZone);renderPreview();}
});
for(const selector of ['#post-date','#post-time'])$(selector).addEventListener('input',composerTimeChanged);

try{state=await loadInitialState(store);plannerLoaded=true}catch(error){state=normalizeState({schemaVersion:2,revision:0,channels:CHANNELS.map(({id,name,handle,color})=>({id,platform:id,name,handle,color,enabled:true,connectionStatus:'manual',postingSchedule:null})),settings:{timezone:config.timezone||defaultTimeZone()},posts:[]});if(store!==browserStore){showInfo('Planung konnte nicht geladen werden',`<p><a href="/post-groups.html">Kanalstatus ansehen</a></p><p>${esc(error?.message||'Der Speicher ist gerade nicht erreichbar.')}</p><p>Damit keine vorhandenen Daten überschrieben werden, ist das Speichern vorerst gesperrt. Lade die Seite erneut, sobald die Verbindung wieder verfügbar ist.</p>`);store.save=async()=>{throw new Error('Bitte lade die Seite neu, bevor du Änderungen speicherst.')};}else{localFallback=true;showInfo('Speicheradapter fehlt',`<p>${esc(error?.message||'Der serverseitige Speicheradapter ist nicht verfügbar.')}</p><p>Speichern bleibt gesperrt. Starte den vollständigen lokalen Planer mit seinem Serveradapter.</p>`);store.save=async()=>{throw new Error('Der serverseitige Speicheradapter fehlt. Speichern ist gesperrt.')}}}
if(['home','calendar','list','queue','drafts','ideas','connections','archive'].includes(location.hash.slice(1)))view=location.hash.slice(1);
anchor=startOfWeek(zonedNow(currentZone()));
const upcoming=calendarPosts(state.posts.filter(p=>p.status==='scheduled'),currentZone()).find(p=>p.calendarTime.local.slice(0,10)>=dateKey(zonedNow(currentZone())));if(upcoming)anchor=startOfWeek(new Date(`${upcoming.calendarTime.local.slice(0,10)}T12:00`));
if(config.storageMode==='server'&&!localFallback){$('.overview-note span:last-child').textContent=config.storageLabel||'Deine Planung wird serverseitig gespeichert.';$('.profile small').textContent=config.storageTitle||'Serverseitig gespeichert';$('#schedule-post').innerHTML=icon('calendar')+esc(config.scheduleButtonLabel||'Im Kalender einplanen')}
if(localFallback){$('.overview-note span:last-child').textContent='Speichern gesperrt: Serveradapter fehlt.';$('.profile small').textContent='Speicher nicht verfügbar'}
if(config.environmentLabel){$('.topbar-right .demo-chip').innerHTML='<span></span>'+esc(config.environmentLabel)}
window.addEventListener('hashchange',()=>{ideaReuseNavigation++;if(['home','calendar','list','queue','drafts','ideas','connections','archive'].includes(location.hash.slice(1))){view=location.hash.slice(1);render();if(queueCalendarReturnDay){if(view==='calendar')$('#period-title').focus();else if(view==='queue')($('#content [data-queue-day="'+queueCalendarReturnDay+'"]')||$('#queue-status')||$('#main')).focus();else queueCalendarReturnDay=null;}}});
render();

$('#variant-tabs').addEventListener('keydown',event=>{const tabs=$$('#variant-tabs [role="tab"]'),current=tabs.indexOf(document.activeElement);if(current<0)return;let index=current;if(event.key==='ArrowRight')index=(current+1)%tabs.length;else if(event.key==='ArrowLeft')index=(current-1+tabs.length)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();switchTextTarget(tabs[index].dataset.textTarget)});

workspaceUI=createWorkspaceUI({statusContainer:$('#workspace-status'),dialog:$('#workspace-dialog'),openButton:$('#open-workspaces'),capture:captureWorkspacePayload,canRestore:canRestoreWorkspace,refreshPlanner:refreshWorkspacePlanner,applyRestore:applyWorkspaceRestore,onStatusChange:()=>{if($('#composer').open)updateDraftSplitAvailability();}});
void workspaceUI.init();
for(const type of ['input','change'])$('#composer-form').addEventListener(type,()=>{if(!saving&&!workspaceRestoring)workspaceUI.captureChanged();});
$('#workspace-without-image').addEventListener('click',()=>{if(saving)return;composerMissingMedia=false;$('#workspace-missing-media').hidden=true;workspaceUI.captureChanged();});

postingTimesUI=createPostingTimesUI({fallbackFocus:()=>$('#composer').open?$('#post-date'):$('#open-posting-times'),dialog:$('#posting-times-dialog'),openButton:$('#open-posting-times'),getState:()=>state,isBusy:()=>saving||workspacePlannerReading||mediaLoading,
  saveState:async next=>{if(saving)throw Error('Eine Speicherung läuft noch.');saving=true;if($('#composer').open)setComposerBusy(true);try{const saved=normalizeState(await store.save(normalizeState(next)));state=saved;render();queuePanel?.invalidate();if($('#composer').open)renderTimingStatus();return saved;}finally{saving=false;if($('#composer').open)setComposerBusy(false);}},
  onSaved:()=>{queuePanel?.invalidate({force:true});if($('#composer').open)renderTimingStatus();}
});

// Mobile preview remains in the same dialog; no persistence or publishing action.
$('#show-composer-preview').addEventListener('click',()=>{$('#composer-preview').scrollIntoView({block:'start'});$('#composer-preview').focus({preventScroll:true});});
$('#back-to-composer').addEventListener('click',()=>{$('#post-text').scrollIntoView({block:'center'});$('#post-text').focus({preventScroll:true});});

installVisualEditor({textarea:$('#post-text'),card:$('#visual-text-card'),modeButton:$('#visual-mode')});

plannerImportUI=createPlannerImportUI({dialog:$('#planner-import-dialog'),getState:()=>state,canOpen:()=>!!state&&!saving&&!$('#composer').open&&!$('#idea-dialog').open,save:async(next,expectedInstants,{requireFuture=false}={})=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{const saved=normalizeState(await store.save(next,{expectedInstants,requireFuture}));state=saved;render();queuePanel?.invalidate();return saved;}finally{saving=false;}}});


// The clock only marks stale display. A new render requires the user's explicit click.
installPlanningClock({
  content:$('#content'),notice:$('#planning-clock-notice'),message:$('#planning-clock-message'),button:$('#refresh-planning-clock'),focusTarget:$('#main'),
  readKey:now=>planningClockKey(state,now),renderedAt:()=>$('#content').dataset.planningRenderedAt,
  isRelevant:()=>plannerLoaded&&['home','queue','calendar','list'].includes(view),
  isBlocked:()=>saving||mediaLoading||workspacePlannerReading||!!document.querySelector('dialog[open]'),
  refresh:()=>render()
});

// Reuse only owned images already referenced by the loaded planning, without another upload.
savedImagePicker=createSavedImagePicker({
  getCatalog:()=>savedImageCatalog(state,{available:plannerLoaded&&!localFallback}),canOpen:canChooseSavedImage,onChoose:applySavedImage,
  fallbackFocus:()=>{if($('#composer').open)$('#choose-saved-image').focus();else $('#main').focus();}
});
savedTextPicker=createSavedTextPicker({getCatalog:()=>savedTextCatalog(state,CHANNELS,{available:plannerLoaded&&!localFallback}),canOpen:canChooseSavedText,onChoose:applySavedText,onClose:closeSavedTexts});
$('#choose-saved-text').addEventListener('click',()=>openSavedTexts());
postTemplatePicker=createPostTemplatePicker({canOpen:canChooseSavedText,onChoose:applyComposerText,onClose:closeSavedTexts});
$('#choose-post-template').addEventListener('click',()=>openSavedTexts('template'));
$('#composer').addEventListener('close',()=>{if(!$('#composer').open){savedTextPicker.close({restoreFocus:false});postTemplatePicker.close({restoreFocus:false});}});
$('#choose-saved-image').addEventListener('click',openSavedImages);
$('#composer').addEventListener('close',()=>savedImagePicker.close({force:true}));

createCalendarRescheduler({container:$('#content'),dialog:$('#calendar-reschedule-dialog'),getContext:()=>({view,range,anchor:dateKey(anchor),channel,query,postTag,calendarStatus,zone:currentZone(),revision:state.revision,storeRevision:store.plannerRevision}),getPost:id=>state.posts.find(p=>p.id===id),isBusy:calendarRescheduleBusy,onApply:applyCalendarReschedule,onError:message=>notify(message),fallbackFocus:()=>$('#main')});

for(const type of ['input','change'])$('#composer-form').addEventListener(type,event=>{if(['post-date','post-time','post-zone'].includes(event.target.id))$('#calendar-reschedule-summary').hidden=true;});

$('#channel-split-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDraftSplit();});
$('#channel-split-dialog').addEventListener('close',()=>{if(!$('#channel-split-dialog').open&&!splitPending){splitPreview=null;splitToken++;}});
$('#composer-form').addEventListener('input',updateDraftSplitAvailability);
$('#composer-form').addEventListener('change',updateDraftSplitAvailability);

// A dedicated intent keeps the displayed canonical draft batch intact through one CAS write.
function channelMediaContext(){
 const w=workspaceUI?.controller?.snapshot;
 return {state,postId:editingId,revision:store.plannerRevision,savedRevision:composerSavedRevision,generation:composerGeneration,editor:editorSnapshot(),initialEditor,open:$('#composer').open,restored:composerRestoredWorkspace,busy:!plannerLoaded||channelMediaFenced||saving||mediaLoading||workspacePlannerReading||workspaceRestoring||splitPending||splitNeedsReload||!!savedAltEdit||composerMissingMedia||imageStudio.hasPendingWork||!!w?.pendingWrite||!!w?.workspace||['saving','checking','closing','uncertain','conflict'].includes(w?.phase)||!!document.querySelector('dialog[open]:not(#composer):not(#channel-media-dialog)')||typeof store.changeChannelMedia!=='function'};
}
function updateChannelMediaAvailability(){const button=$('#edit-channel-media');if(!button)return;const post=state.posts.find(p=>p.id===editingId);button.hidden=!post||post.status!=='draft'||post.channels.length<2;button.disabled=!channelMediaEligible(channelMediaContext());button.title=button.disabled?'Gespeicherten Entwurf ohne offene Änderungen verwenden.':'';const continuation=$('#continue-composer');if(continuation&&!saving){continuation.disabled=!!composerChannelMedia;if(composerChannelMedia)continuation.checked=false;}}
channelMediaUI=createChannelMediaUI({dialog:$('#channel-media-dialog'),getContext:channelMediaContext,channels:CHANNELS,
 save:async(ui,options)=>{if(saving)throw Error('Speicherung läuft.');saving=true;setComposerBusy(true);try{return await store.changeChannelMedia(ui,options);}finally{saving=false;setComposerBusy(false);}},
 onFailure:()=>{channelMediaFenced=true;updateChannelMediaAvailability();},
 onSaved:(saved,preview)=>{state=normalizeState(saved);render();if(composerGeneration===preview.generation&&editingId===preview.postId&&editorSnapshot()===preview.editor){closeComposer();openComposer(preview.postId);}else{composerSavedRevision=null;notify('Kanalbilder gespeichert. Neuere Eingaben vor dem Neuladen kopieren.');}notify('Kanalbilder gespeichert.');}
});
window.addEventListener('beforeunload',event=>{if(channelMediaUI?.hasUnsavedInput){event.preventDefault();event.returnValue='';}});

// Only the committed new ID becomes the workspace origin. The idea is never edited here.
ideaReuseUI=createIdeaReuse({
  getContext:()=>({state,view,query,ideaTag,navigation:ideaReuseNavigation,busy:!plannerLoaded||localFallback||saving||workspacePlannerReading||workspaceRestoring||mediaLoading||splitPending||store.mutationRequiresReload||!!workspaceUI?.hasUnsavedLocalInput||!!workspaceUI?.controller?.snapshot.pendingWrite||['saving','checking','uncertain','conflict'].includes(workspaceUI?.controller?.snapshot.phase)||(workspaceUI?.controller?.snapshot.open&&workspaceUI?.controller?.snapshot.phase==='closing')||!!document.querySelector('dialog[open]')||typeof store.reuseIdea!=='function'}),
  save:(ui,options)=>store.reuseIdea(ui,options),
  setBusy:value=>{saving=value;for(const button of $$('[data-reuse-idea]')){button.disabled=!ideaReuseUI.available();button.setAttribute('aria-busy',String(value));}},
  onFailure:()=>{if(store.mutationRequiresReload){workspaceUI?.destroy();$('#open-workspaces').disabled=true;}},
  onSaved:(result,{open})=>{state=normalizeState(result.state);render();if(open){view='drafts';query='';postTag='';channel='all';$('#search').value='';render();history.replaceState(null,'','#drafts');openComposer(result.copyId);}},
  notify
});
// The first render precedes controller setup; enable only eligible card actions now.
for(const button of $$('[data-reuse-idea]'))button.disabled=!ideaReuseUI.available();
window.addEventListener('beforeunload',event=>{if(ideaReuseUI?.pending){event.preventDefault();event.returnValue='';}});

archiveDraftsUI=createArchiveDraftsUI({
  dialog:$('#archive-drafts-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,revision:store.plannerRevision}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&!workspaceUI?.controller.snapshot.pendingWrite&&view==='drafts'&&!document.querySelector('dialog[open]')&&typeof store.previewArchiveDrafts==='function'&&typeof store.archiveDrafts==='function',
  prepare:(ui,options)=>store.previewArchiveDrafts(ui,options),cancel:preview=>store.cancelArchiveDrafts(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.archiveDrafts(ui,preview);}catch(error){if(store.mutationRequiresReload){workspaceUI?.destroy();$('#open-workspaces').disabled=true;}throw error;}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="archive-drafts"]')||$('#main')
});
window.addEventListener('beforeunload',event=>{if(archiveDraftsUI?.pending){event.preventDefault();event.returnValue='';}});

draftBatchUI=createDraftBatchUI({
  dialog:$('#draft-batch-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,revision:store.plannerRevision}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!mediaLoading&&view==='drafts'&&!document.querySelector('dialog[open]')&&typeof store.previewDraftBatch==='function'&&typeof store.scheduleDraftBatch==='function',
  prepare:(ui,options)=>store.previewDraftBatch(ui,options),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.scheduleDraftBatch(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="batch-drafts"]')||$('#main')
});

window.addEventListener('beforeunload',e=>{if(draftBatchUI?.pending){e.preventDefault();e.returnValue='';}});

queueSwapUI=createQueueSwapUI({
  dialog:$('#queue-swap-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,queueStatus,zone:currentZone()}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&!draftBatchUI?.pending&&view==='queue'&&channel!=='all'&&!document.querySelector('dialog[open]:not(#queue-swap-dialog)')&&typeof store.previewQueueSwap==='function'&&typeof store.swapQueue==='function'&&typeof store.cancelQueueSwap==='function',
  prepare:(ui,options)=>store.previewQueueSwap(ui,options),cancel:preview=>store.cancelQueueSwap(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.swapQueue(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#queue-status')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(queueSwapUI?.pending){e.preventDefault();e.returnValue='';}});

queueReflowUI=createQueueReflowUI({
  dialog:$('#queue-reflow-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,queueStatus,zone:currentZone()}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&!draftBatchUI?.pending&&!queuePriorityUI?.pending&&view==='queue'&&channel!=='all'&&!document.querySelector('dialog[open]:not(#queue-reflow-dialog)')&&typeof store.previewQueueReflow==='function'&&typeof store.reflowQueue==='function'&&typeof store.cancelQueueReflow==='function',
  prepare:(ui,options)=>store.previewQueueReflow(ui,options),cancel:preview=>store.cancelQueueReflow(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.reflowQueue(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="queue-reflow"]')||$('#queue-status')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(queueReflowUI?.pending){e.preventDefault();e.returnValue='';}});

queuePriorityUI=createQueuePriorityUI({
  dialog:$('#queue-priority-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,queueStatus,zone:currentZone()}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&!draftBatchUI?.pending&&view==='queue'&&channel!=='all'&&!document.querySelector('dialog[open]:not(#queue-priority-dialog)')&&typeof store.previewQueuePriority==='function'&&typeof store.prioritizeQueue==='function'&&typeof store.cancelQueuePriority==='function',
  prepare:(ui,options)=>store.previewQueuePriority(ui,options),cancel:preview=>store.cancelQueuePriority(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.prioritizeQueue(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#queue-status')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(queuePriorityUI?.pending){e.preventDefault();e.returnValue='';}});

returnDraftsUI=createReturnDraftsUI({
  dialog:$('#return-drafts-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,queueStatus,revision:store.plannerRevision}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&view==='queue'&&!document.querySelector('dialog[open]')&&typeof store.previewReturnDrafts==='function'&&typeof store.returnDrafts==='function',
  prepare:(ui,options)=>store.previewReturnDrafts(ui,options),cancel:preview=>store.cancelReturnDrafts(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.returnDrafts(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="return-drafts"]')||$('#queue-status')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(returnDraftsUI?.pending){e.preventDefault();e.returnValue='';}});


draftLabelsUI=createDraftLabelsUI({
 dialog:$('#draft-labels-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,revision:store.plannerRevision}),
 canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&view==='drafts'&&!document.querySelector('dialog[open]')&&typeof store.previewDraftLabels==='function',
 prepare:(ui,options)=>store.previewDraftLabels(ui,options),cancel:preview=>store.cancelDraftLabels(preview),
 save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.applyDraftLabels(ui,preview);}finally{saving=false;}},
 onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="label-drafts"]')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(draftLabelsUI?.pending){e.preventDefault();e.returnValue='';}});

draftReplaceUI=createDraftReplaceUI({
 dialog:$('#draft-replace-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,revision:store.plannerRevision}),
 canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&view==='drafts'&&!document.querySelector('dialog[open]')&&typeof store.previewDraftReplace==='function',
 prepare:(ui,options)=>store.previewDraftReplace(ui,options),cancel:preview=>store.cancelDraftReplace(preview),
 save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.applyDraftReplace(ui,preview);}finally{saving=false;}},
 onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="replace-drafts"]')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(draftReplaceUI?.pending){e.preventDefault();e.returnValue='';}});

// Capture only the explicitly visible period and current filters; opening selects nothing.
dateShiftUI=createDateShiftUI({
  dialog:$('#date-shift-dialog'),getState:()=>state,getContext:()=>({view,channel,query,postTag,calendarStatus,range,anchor:dateKey(anchor),zone:currentZone()}),
  canOpen:()=>plannerLoaded&&!localFallback&&!saving&&!workspacePlannerReading&&!workspaceRestoring&&!mediaLoading&&!splitPending&&['calendar','list'].includes(view)&&!document.querySelector('dialog[open]:not(#date-shift-dialog)')&&typeof store.previewDateShift==='function'&&typeof store.shiftDates==='function'&&typeof store.cancelDateShift==='function',
  prepare:(ui,options)=>store.previewDateShift(ui,options),cancel:preview=>store.cancelDateShift(preview),
  save:async(ui,preview)=>{if(saving)throw Error('Speicherung läuft.');saving=true;try{return await store.shiftDates(ui,preview);}finally{saving=false;}},
  onSaved:saved=>{state=normalizeState(saved);render();queuePanel?.invalidate();},fallbackFocus:()=>$('#content [data-action="date-shift"]')||$('#main')
});
window.addEventListener('beforeunload',e=>{if(dateShiftUI?.pending){e.preventDefault();e.returnValue='';}});
