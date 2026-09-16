import{getLeads,getFollowups,getPreferences,savePreferences,createActivity,getLeadActivities,getReadNotifications,saveReadNotifications,resetDatabase,LEAD_STATUSES,PRIORITIES,FOLLOWUP_TYPES,FOLLOWUP_STATUSES,INDUSTRIES,SOURCES}from"./data.js";
import{$,$$,byId,escapeHTML,formatCurrency,formatNumber,formatDate,formatDateTime,generateAvatar,showToast,confirmAction,downloadFile,objectToCSV,parseCSV,todayISO,isToday,isOverdue,debounce}from"./utils.js";
import{leadState,getLeadById,validateLead,createLead,updateLead,deleteLead,changeLeadStatus,assignLead,applyLeadFilters,getLeadMetrics,getSourceDistribution,getStageDistribution,getPriorityDistribution,renderLeadTable,renderKanban,getCSVColumns,importLeads}from"./leads.js";
import{getFollowupById,getLeadFollowups,createFollowup,updateFollowup,deleteFollowup,completeFollowup,getFollowupSummary,renderFollowups,renderLeadFollowups}from"./followups.js";
let preferences=getPreferences();
let currentRole=preferences.role==="Sales Executive"?"Sales Executive":"Manager";
let currentView=preferences.view==="kanban"?"kanban":"table";
let currentLeadId=null;
let currentFollowupId=null;
let followupFilter="all";
let pendingCSVRows=null;
const E={
	sections:$$('.page-section'),nav:$$('.navigation-link'),role:byId('roleSelector'),leadForm:byId('leadForm'),followupForm:byId('followupForm'),leadModal:byId('leadModalOverlay'),followupModal:byId('followupModalOverlay'),detailsModal:byId('leadDetailsModalOverlay'),leadTable:byId('leadsTableBody'),followups:byId('followupsList'),notificationPanel:byId('notificationPanel'),notificationList:byId('notificationList'),file:byId('csvFileInput')
};
const roleIsManager=()=>currentRole==="Manager";
const canEditLead=lead=>Boolean(lead)&&(roleIsManager()||lead.assignedTo===currentRole);
const visibleLeads=()=>roleIsManager()?getLeads():getLeads().filter(lead=>lead.assignedTo===currentRole);
const visibleFollowups=()=>roleIsManager()?getFollowups():getFollowups().filter(f=>getLeadById(f.leadId)?.assignedTo===currentRole);
const text=(id,value)=>{const el=byId(id);if(el)el.textContent=value;};
const openModal=overlay=>{if(!overlay)return;overlay.hidden=false;overlay.classList.add('active');document.body.classList.add('modal-open');};
const closeModal=overlay=>{if(!overlay)return;overlay.hidden=true;overlay.classList.remove('active');document.body.classList.remove('modal-open');};
const closeAllModals=()=>[E.leadModal,E.followupModal,E.detailsModal,byId('deleteConfirmModalOverlay'),byId('deleteFollowupConfirmModalOverlay')].forEach(closeModal);
const clearErrors=form=>{if(!form)return;$$('.field-error',form).forEach(el=>el.textContent='');const summary=$('.form-error-summary',form);if(summary){summary.textContent='';summary.hidden=true;}$$('.error',form).forEach(el=>el.classList.remove('error'));};
const showErrors=(form,errors)=>{clearErrors(form);const messages=[];Object.entries(errors||{}).forEach(([field,message])=>{const map={name:'leadName',company:'leadCompany',email:'leadEmail',phone:'leadPhone',industry:'leadIndustry',source:'leadSource',status:'leadStatus',priority:'leadPriority',assignedTo:'assignedTo',value:'expectedValue',followUpDate:'followUpDate',leadId:'followupLead',date:'followupDate',time:'followupTime',type:'followupType',notes:'leadNotes'};const input=byId(map[field]||field);if(input){input.classList.add('error');const error=byId(`${input.id}Error`)||input.parentElement?.querySelector('.field-error');if(error)error.textContent=message;}messages.push(message);});const summary=$('.form-error-summary',form);if(summary&&messages.length){summary.textContent=messages.join(' ');summary.hidden=false;}};
const fillSelect=(id,values,placeholder)=>{const el=byId(id);if(!el)return;const current=el.value;el.innerHTML=`<option value="">${escapeHTML(placeholder)}</option>`+values.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');if(values.includes(current))el.value=current;};
const initSelects=()=>{fillSelect('statusFilter',LEAD_STATUSES,'All Statuses');fillSelect('priorityFilter',PRIORITIES,'All Priorities');fillSelect('sourceFilter',SOURCES,'All Sources');fillSelect('leadStatus',LEAD_STATUSES,'Select Status');fillSelect('leadPriority',PRIORITIES,'Select Priority');fillSelect('leadIndustry',INDUSTRIES,'Select Industry');fillSelect('leadSource',SOURCES,'Select Source');fillSelect('followupType',FOLLOWUP_TYPES,'Select Type');fillSelect('followupStatus',FOLLOWUP_STATUSES,'Select Status');};
const setTheme=theme=>{const dark=theme==='dark';document.body.classList.toggle('dark-mode',dark);document.documentElement.dataset.theme=dark?'dark':'light';text('themeToggleIcon',dark?'☀':'☾');text('themeToggleText',dark?'Light Mode':'Dark Mode');byId('settingsThemeSelector')&&(byId('settingsThemeSelector').value=dark?'dark':'light');savePreferences({theme:dark?'dark':'light'});};
const updateRoleUI=()=>{if(E.role)E.role.value=currentRole;text('sidebarRoleName',currentRole);$$('[data-manager-only]').forEach(el=>el.hidden=!roleIsManager());const nav=$('[data-section="analytics"]')?.closest('.navigation-item');if(nav)nav.hidden=!roleIsManager();};
const navigate=page=>{if(page==='analytics'&&!roleIsManager()){showToast('Analytics are available only to Manager role.','warning');page='dashboard';}E.sections.forEach(section=>{const active=section.dataset.page===page;section.hidden=!active;section.classList.toggle('active-section',active);});E.nav.forEach(link=>link.classList.toggle('active',link.dataset.section===page));const active=E.nav.find(link=>link.dataset.section===page);text('pageTitle',active?.textContent.trim()||'Dashboard');location.hash=page;if(page==='dashboard')renderDashboard();if(page==='leads')renderLeads();if(page==='kanban')renderMainKanban();if(page==='followups')renderFollowupsPage();if(page==='analytics')renderAnalytics();if(page==='import-export')renderImport();if(page==='settings')renderSettings();closeSidebar();};
const renderDashboard=()=>{const leads=visibleLeads(),m=getLeadMetrics(leads);text('totalLeadsMetric',formatNumber(m.total));text('newLeadsMetric',formatNumber(m.newLeads));text('qualifiedLeadsMetric',formatNumber(m.qualified));text('convertedLeadsMetric',formatNumber(m.converted));text('conversionRateMetric',`${m.conversionRate.toFixed(1)}%`);text('pipelineValueMetric',formatCurrency(m.pipelineValue));renderSourceChart(leads,'dashboardSourceChart');renderFunnel(leads,'dashboardFunnelChart');const summary=getFollowupSummary(visibleFollowups());text('dashboardDueToday',summary.today);text('dashboardUpcoming',summary.upcoming);text('dashboardOverdue',summary.overdue);text('dashboardCompleted',summary.completed);const recent=$('#recentLeadsList');if(recent){const records=[...leads].sort((a,b)=>String(b.createdDate).localeCompare(String(a.createdDate))).slice(0,5);recent.innerHTML=records.length?records.map(l=>`<button type="button" class="mini-lead-item" data-mini-lead="${escapeHTML(l.id)}"><span class="mini-lead-avatar">${escapeHTML(generateAvatar(l.name))}</span><span class="mini-lead-content"><strong>${escapeHTML(l.name)}</strong><span>${escapeHTML(l.company)}</span></span><span class="status-badge">${escapeHTML(l.status)}</span></button>`).join(''):`<p class="empty-message">No leads available.</p>`;}};
const renderSourceChart=(leads,id)=>{const box=byId(id);if(!box)return;const data=getSourceDistribution(leads),entries=Object.entries(data);if(!entries.length){box.innerHTML='<div class="chart-empty-state">No lead data available.</div>';return;}const max=Math.max(...entries.map(x=>x[1]),1);box.innerHTML=entries.map(([name,count])=>`<div class="chart-bar-row"><div class="chart-bar-label">${escapeHTML(name)}</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${count/max*100}%"></div></div><div class="chart-bar-value">${count}</div></div>`).join('');};
const renderFunnel=(leads,id)=>{const box=byId(id);if(!box)return;if(!leads.length){box.innerHTML='<div class="chart-empty-state">No lead data available.</div>';return;}const data=getStageDistribution(leads),stages=['New','Contacted','Interested','Qualified','Proposal','Negotiation','Converted'],max=Math.max(...stages.map(s=>data[s]||0),1);box.innerHTML=stages.map(s=>`<div class="chart-bar-row"><div class="chart-bar-label">${escapeHTML(s)}</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(data[s]||0)/max*100}%"></div></div><div class="chart-bar-value">${data[s]||0}</div></div>`).join('');};
const renderLeads=()=>{const filtered=visibleLeads().filter(lead=>applyLeadFilters([lead]).length);const total=filtered.length,pages=Math.max(1,Math.ceil(total/leadState.pageSize));leadState.page=Math.min(Math.max(leadState.page,1),pages);const start=(leadState.page-1)*leadState.pageSize;const records=filtered.slice(start,start+leadState.pageSize);renderLeadTable(E.leadTable,records,currentRole);text('leadResultCount',total);text('paginationSummary',total?`Showing ${start+1}–${Math.min(start+leadState.pageSize,total)} of ${total} leads`:'Showing 0–0 of 0 leads');const prev=byId('previousPageBtn'),next=byId('nextPageBtn');if(prev)prev.disabled=leadState.page<=1;if(next)next.disabled=leadState.page>=pages;const pagesBox=byId('paginationPages');if(pagesBox)pagesBox.innerHTML=Array.from({length:pages},(_,i)=>i+1).map(p=>`<button type="button" class="pagination-page ${p===leadState.page?'active':''}" data-page="${p}">${p}</button>`).join('');updateView();};
const updateView=()=>{$$('.view-switch-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));const table=byId('tableView'),kanban=byId('inlineKanbanView');if(table)table.hidden=currentView!=='table';if(kanban){kanban.hidden=currentView!=='kanban';if(currentView==='kanban')renderKanban(kanban,visibleLeads(),currentRole);}};
const renderMainKanban=()=>{renderKanban(byId('mainKanbanBoard'),visibleLeads(),currentRole);};
const renderFollowupsPage=()=>{renderFollowups(E.followups,followupFilter,currentRole);const s=getFollowupSummary(visibleFollowups());text('followupsDueToday',s.today);text('followupsUpcoming',s.upcoming);text('followupsOverdue',s.overdue);text('followupsCompleted',s.completed);};
const renderFollowupAnalytics=()=>{
	const box=byId('analyticsFollowupChart');
	if(!box)return;
	const followups=visibleFollowups();
	const counts={
		Pending:followups.filter(f=>f.status==='Pending').length,
		Completed:followups.filter(f=>f.status==='Completed').length,
		Cancelled:followups.filter(f=>f.status==='Cancelled').length,
		Overdue:followups.filter(f=>f.status==='Pending'&&isOverdue(f.date)).length
	};
	const max=Math.max(...Object.values(counts),1);
	box.innerHTML=Object.entries(counts).map(([label,count])=>`
		<div class="chart-bar-row">
			<div class="chart-bar-label">${label}</div>
			<div class="chart-bar-track">
				<div class="chart-bar-fill" style="width:${(count/max)*100}%"></div>
			</div>
			<div class="chart-bar-value">${count}</div>
		</div>
	`).join('');
};
const renderAnalytics=()=>{
	if(!roleIsManager())return;
	const leads=getLeads(),m=getLeadMetrics(leads),avg=leads.length?leads.reduce((s,l)=>s+Number(l.value||0),0)/leads.length:0,q=leads.filter(l=>l.status==='Qualified').reduce((s,l)=>s+Number(l.value||0),0);
	text('analyticsPipelineValue',formatCurrency(m.pipelineValue));
	text('analyticsConversionRate',`${m.conversionRate.toFixed(1)}%`);
	text('analyticsAverageValue',formatCurrency(avg));
	text('analyticsQualifiedValue',formatCurrency(q));
	renderSourceChart(leads,'analyticsSourceChart');
	renderFunnel(leads,'analyticsFunnelChart');
	renderFollowupAnalytics();
	const box=byId('analyticsPriorityChart'),p=getPriorityDistribution(leads);
	if(box)box.innerHTML=PRIORITIES.map(x=>`<div class="chart-bar-row"><div class="chart-bar-label">${x}</div><div class="chart-bar-track"><div class="chart-bar-fill" style="width:${(p[x]||0)/Math.max(leads.length,1)*100}%"></div></div><div class="chart-bar-value">${p[x]||0}</div></div>`).join('');
};
const renderImport=()=>{const saved=localStorage.getItem('miniCRM_lastImport');if(!saved)return;try{const r=JSON.parse(saved),box=byId('importResults');if(box){box.hidden=false;text('importResultSummary',`${r.imported} imported, ${r.invalid} invalid`);}}catch(error){console.error(error);}};
const renderSettings=()=>{const theme=byId('settingsThemeSelector'),view=byId('defaultLeadViewSelector');if(theme)theme.value=preferences.theme||'light';if(view)view.value=currentView;};
const resetLeadForm=()=>{E.leadForm?.reset();currentLeadId=null;text('leadModalTitle','Add New Lead');const status=byId('leadStatus'),priority=byId('leadPriority'),assigned=byId('assignedTo');if(status)status.value='New';if(priority)priority.value='Medium';if(assigned){assigned.disabled=!roleIsManager();assigned.value=roleIsManager()?'Sales Executive':currentRole;}text('leadNotesCount','0 / 1000');clearErrors(E.leadForm);};
const fillLeadForm=lead=>{currentLeadId=lead.id;text('leadModalTitle','Edit Lead');const fields={leadId:lead.id,leadName:lead.name,leadCompany:lead.company,leadEmail:lead.email,leadPhone:lead.phone,leadIndustry:lead.industry,leadSource:lead.source,leadStatus:lead.status,leadPriority:lead.priority,assignedTo:lead.assignedTo,expectedValue:lead.value,followUpDate:lead.followUpDate,leadNotes:lead.notes};Object.entries(fields).forEach(([id,value])=>{const el=byId(id);if(el)el.value=value??'';});const assigned=byId('assignedTo');if(assigned)assigned.disabled=!roleIsManager();text('leadNotesCount',`${String(lead.notes||'').length} / 1000`);clearErrors(E.leadForm);};
const leadData=()=>({name:byId('leadName')?.value,company:byId('leadCompany')?.value,email:byId('leadEmail')?.value,phone:byId('leadPhone')?.value,industry:byId('leadIndustry')?.value,source:byId('leadSource')?.value,status:byId('leadStatus')?.value,priority:byId('leadPriority')?.value,assignedTo:roleIsManager()?byId('assignedTo')?.value:currentRole,value:byId('expectedValue')?.value,followUpDate:byId('followUpDate')?.value,notes:byId('leadNotes')?.value});
const openAddLead=(status='')=>{resetLeadForm();if(status)byId('leadStatus').value=status;openModal(E.leadModal);setTimeout(()=>byId('leadName')?.focus(),50);};
const openEditLead=id=>{const lead=getLeadById(id);if(!lead)return;if(!canEditLead(lead)){showToast('You can only edit leads assigned to you.','warning');return;}fillLeadForm(lead);openModal(E.leadModal);};
const openDetails=id=>{
	const lead=getLeadById(id);
	if(!lead)return;
	currentLeadId=id;
	text('detailsLeadName',lead.name);
	text('detailsLeadCompany',lead.company);
	text('detailsLeadId',lead.id);
	const avatar=byId('leadDetailsAvatar');
	if(avatar)avatar.textContent=generateAvatar(lead.name);
	const email=byId('detailsLeadEmail');
	const phone=byId('detailsLeadPhone');
	const industry=byId('detailsLeadIndustry');
	const source=byId('detailsLeadSource');
	const status=byId('detailsLeadStatus');
	const priority=byId('detailsLeadPriority');
	const value=byId('detailsLeadValue');
	const assigned=byId('detailsLeadAssigned');
	const followUpDate=byId('detailsLeadFollowUpDate');
	const notes=byId('detailsLeadNotes');
	if(email)email.textContent=lead.email||'—';
	if(phone)phone.textContent=lead.phone||'—';
	if(industry)industry.textContent=lead.industry||'—';
	if(source)source.textContent=lead.source||'—';
	if(status)status.textContent=lead.status||'—';
	if(priority)priority.textContent=lead.priority||'—';
	if(value)value.textContent=formatCurrency(lead.value);
	if(assigned)assigned.textContent=lead.assignedTo||'—';
	if(followUpDate)followUpDate.textContent=lead.followUpDate||'—';
	if(notes)notes.textContent=lead.notes||'No notes';
	const detailsContent=byId('leadDetailsContent');
	if(detailsContent&&!byId('detailsLeadEmail')){
		detailsContent.innerHTML=`
			<div class="details-grid">
				<div><strong>Email</strong><p id="detailsLeadEmail">${escapeHTML(lead.email||'—')}</p></div>
				<div><strong>Phone</strong><p id="detailsLeadPhone">${escapeHTML(lead.phone||'—')}</p></div>
				<div><strong>Industry</strong><p id="detailsLeadIndustry">${escapeHTML(lead.industry||'—')}</p></div>
				<div><strong>Source</strong><p id="detailsLeadSource">${escapeHTML(lead.source||'—')}</p></div>
				<div><strong>Status</strong><p id="detailsLeadStatus">${escapeHTML(lead.status||'—')}</p></div>
				<div><strong>Priority</strong><p id="detailsLeadPriority">${escapeHTML(lead.priority||'—')}</p></div>
				<div><strong>Expected Value</strong><p id="detailsLeadValue">${formatCurrency(lead.value)}</p></div>
				<div><strong>Assigned To</strong><p id="detailsLeadAssigned">${escapeHTML(lead.assignedTo||'—')}</p></div>
				<div><strong>Follow-up Date</strong><p id="detailsLeadFollowUpDate">${escapeHTML(lead.followUpDate||'—')}</p></div>
				<div><strong>Notes</strong><p id="detailsLeadNotes">${escapeHTML(lead.notes||'No notes')}</p></div>
			</div>`;
	}
	const statusSelector=byId('detailsStatusSelector');
	if(statusSelector)statusSelector.value=lead.status;
	const editButton=byId('detailsEditLeadBtn');
	if(editButton)editButton.dataset.id=id;
	const followupButton=byId('leadFollowupsAddBtn');
	if(followupButton)followupButton.dataset.leadId=id;
	renderLeadFollowups(byId('leadFollowupsList'),id,currentRole);
	const timeline=byId('leadActivityTimeline');
	if(timeline){
		const acts=getLeadActivities(id).sort((a,b)=>new Date(b.date)-new Date(a.date));
		timeline.innerHTML=acts.length?acts.map(a=>`
			<div class="timeline-item">
				<div class="timeline-dot"></div>
				<div>
					<strong>${escapeHTML(a.type)}</strong>
					<p>${escapeHTML(a.description)}</p>
					<span>${escapeHTML(formatDateTime(a.date))}</span>
				</div>
			</div>`).join(''):`<div class="timeline-empty">No activity yet.</div>`;
	}
	openModal(E.detailsModal);
};
const openFollowup=(leadId=null,id=null)=>{currentFollowupId=id;clearErrors(E.followupForm);E.followupForm?.reset();text('followupModalTitle',id?'Edit Follow-up':'Add Follow-up');const select=byId('followupLead');if(select){select.innerHTML='<option value="">Select Lead</option>'+visibleLeads().map(l=>`<option value="${escapeHTML(l.id)}">${escapeHTML(l.name)} — ${escapeHTML(l.company)}</option>`).join('');if(leadId)select.value=leadId;}if(id){const f=getFollowupById(id);if(!f)return;[['followupId',f.id],['followupLead',f.leadId],['followupDate',f.date],['followupTime',f.time],['followupType',f.type],['followupStatus',f.status],['followupNotes',f.notes]].forEach(([key,value])=>{const el=byId(key);if(el)el.value=value??'';});}else{byId('followupDate')&&(byId('followupDate').value=todayISO());byId('followupStatus')&&(byId('followupStatus').value='Pending');}text('followupNotesCount',`${byId('followupNotes')?.value.length||0} / 500`);openModal(E.followupModal);};
const followupData=()=>({leadId:byId('followupLead')?.value,date:byId('followupDate')?.value,time:byId('followupTime')?.value,type:byId('followupType')?.value,status:byId('followupStatus')?.value,notes:byId('followupNotes')?.value});
const handleLeadSubmit=e=>{e.preventDefault();const result=currentLeadId?updateLead(currentLeadId,leadData()):createLead(leadData());if(!result.success){showErrors(E.leadForm,result.errors);showToast('Please correct the highlighted fields.','error');return;}closeModal(E.leadModal);showToast(currentLeadId?'Lead updated successfully.':'Lead created successfully.','success');currentLeadId=null;renderAll();};
const handleFollowupSubmit=e=>{e.preventDefault();const data=followupData(),lead=getLeadById(data.leadId);if(!lead){showErrors(E.followupForm,{leadId:'Please select a valid lead.'});return;}if(!canEditLead(lead)){showToast('You cannot manage this lead follow-up.','warning');return;}const result=currentFollowupId?updateFollowup(currentFollowupId,data):createFollowup(data);if(!result.success){showErrors(E.followupForm,result.errors);showToast('Please correct the highlighted fields.','error');return;}closeModal(E.followupModal);showToast(currentFollowupId?'Follow-up updated.':'Follow-up added.','success');currentFollowupId=null;renderAll();};
const handleAction=async e=>{const button=e.target.closest('[data-action]');if(button){const id=button.dataset.id,action=button.dataset.action,lead=getLeadById(id);if(!lead)return;if(action==='view')openDetails(id);if(action==='edit')openEditLead(id);if(action==='followup')openFollowup(id);if(action==='status')quickStatus(id);if(action==='delete'){if(!roleIsManager()){showToast('Only Manager can delete leads.','warning');return;}if(await confirmAction(`Delete ${lead.name}?`,'Delete Lead')){deleteLead(id);showToast('Lead deleted.','success');renderAll();}}return;}const fbutton=e.target.closest('[data-followup-action]');if(fbutton){const id=fbutton.dataset.id,f=getFollowupById(id),lead=f&&getLeadById(f.leadId);if(!f||!lead)return;if(!canEditLead(lead)){showToast('You do not have permission.','warning');return;}if(fbutton.dataset.followupAction==='edit')openFollowup(f.leadId,id);if(fbutton.dataset.followupAction==='complete'){completeFollowup(id);showToast('Follow-up completed.','success');renderAll();}if(fbutton.dataset.followupAction==='delete'&&await confirmAction('Delete this follow-up?','Delete Follow-up')){deleteFollowup(id);showToast('Follow-up deleted.','success');renderAll();}}};
const quickStatus=id=>{const lead=getLeadById(id);if(!lead||!canEditLead(lead))return;const overlay=document.createElement('div');overlay.className='modal-overlay active';overlay.innerHTML=`<div class="modal modal-small"><div class="modal-header"><h2>Change Status</h2><button type="button" class="modal-close-btn">×</button></div><div class="form-group"><label>Status</label><select class="form-control" id="quickStatus">${LEAD_STATUSES.map(s=>`<option ${s===lead.status?'selected':''}>${s}</option>`).join('')}</select></div><div class="modal-footer"><button class="btn btn-secondary cancel">Cancel</button><button class="btn btn-primary save">Save</button></div></div>`;document.body.appendChild(overlay);const close=()=>overlay.remove();$('.cancel',overlay).onclick=close;$('.modal-close-btn',overlay).onclick=close;$('.save',overlay).onclick=()=>{changeLeadStatus(id,$('#quickStatus',overlay).value);close();showToast('Status updated.','success');renderAll();};};
const renderNotifications=()=>{const list=visibleFollowups().filter(f=>f.status==='Pending'&&(isToday(f.date)||isOverdue(f.date))),read=new Set(getReadNotifications()),unread=list.filter(f=>!read.has(f.id));text('notificationCount',unread.length);if(E.notificationList)E.notificationList.innerHTML=list.length?list.map(f=>`<button type="button" class="notification-item" data-notification-id="${escapeHTML(f.id)}"><strong>${isToday(f.date)?'Due today':'Overdue'}</strong><span>${escapeHTML(getLeadById(f.leadId)?.name||'Lead')} — ${escapeHTML(f.type)}</span></button>`).join(''):'<p class="empty-message">No notifications.</p>';};
const renderAll=()=>{updateRoleUI();renderDashboard();renderLeads();renderMainKanban();renderFollowupsPage();renderAnalytics();renderNotifications();renderSettings();};
const resetFilters=()=>{['leadSearch','customDateFrom','customDateTo','minValueFilter','maxValueFilter'].forEach(id=>{const el=byId(id);if(el)el.value='';});['statusFilter','priorityFilter','sourceFilter','dateFilter'].forEach(id=>{const el=byId(id);if(el)el.value='';});Object.assign(leadState,{search:'',status:'',priority:'',source:'',dateFilter:'',customStart:'',customEnd:'',minValue:'',maxValue:'',page:1});renderLeads();};
const setup=()=>{initSelects();setTheme(preferences.theme||'light');leadState.pageSize=Number(preferences.pageSize)||20;E.nav.forEach(link=>link.addEventListener('click',e=>{e.preventDefault();navigate(link.dataset.section);}));$$('[data-section-link]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();navigate(link.dataset.sectionLink);}));E.leadForm?.addEventListener('submit',handleLeadSubmit);E.followupForm?.addEventListener('submit',handleFollowupSubmit);document.addEventListener('click',e=>{const add=e.target.closest('[data-add-lead],#dashboardAddLeadBtn,#addLeadBtn,#emptyStateAddLeadBtn,#kanbanAddLeadBtn');if(add){openAddLead(add.dataset.kanbanAdd||'');return;}const k=e.target.closest('[data-kanban-add],.kanban-add-btn');if(k){openAddLead(k.dataset.kanbanAdd||k.dataset.status||'New');return;}const af=e.target.closest('[data-add-followup],#addFollowupBtn,#emptyFollowupBtn,#leadFollowupsAddBtn');if(af){openFollowup(af.dataset.leadId||currentLeadId||null);return;}const close=e.target.closest('[data-modal-close],#closeLeadModalBtn,#cancelLeadBtn,#closeFollowupModalBtn,#cancelFollowupBtn,#closeLeadDetailsModalBtn');if(close){closeModal(close.closest('.modal-overlay'));return;}const mini=e.target.closest('[data-mini-lead]');if(mini){openDetails(mini.dataset.miniLead);return;}const kv=e.target.closest('[data-kanban-view]');if(kv){openDetails(kv.dataset.kanbanView);return;}const detailEdit=e.target.closest('#detailsEditLeadBtn');if(detailEdit){closeModal(E.detailsModal);openEditLead(currentLeadId);return;}const detailFollow=e.target.closest('#detailsAddFollowupButton,#leadFollowupsAddBtn');if(detailFollow){openFollowup(currentLeadId);return;}const notif=e.target.closest('[data-notification-id]');if(notif){const ids=new Set(getReadNotifications());ids.add(notif.dataset.notificationId);saveReadNotifications([...ids]);renderNotifications();navigate('followups');return;}handleAction(e);});
	$$('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o);}));
	byId('leadSearch')?.addEventListener('input',debounce(e=>{leadState.search=e.target.value.trim();leadState.page=1;renderLeads();},200));
	[['statusFilter','status'],['priorityFilter','priority'],['sourceFilter','source'],['dateFilter','dateFilter'],['customDateFrom','customStart'],['customDateTo','customEnd'],['minValueFilter','minValue'],['maxValueFilter','maxValue']].forEach(([id,key])=>byId(id)?.addEventListener('change',e=>{leadState[key]=e.target.value;leadState.page=1;const custom=byId('dateFilter')?.value==='custom';byId('customDateGroup')&&(byId('customDateGroup').hidden=!custom);byId('customDateToGroup')&&(byId('customDateToGroup').hidden=!custom);renderLeads();}));
	byId('sortField')?.addEventListener('change',e=>{leadState.sortField=e.target.value;leadState.page=1;renderLeads();});byId('sortDirectionBtn')?.addEventListener('click',()=>{leadState.sortDirection=leadState.sortDirection==='asc'?'desc':'asc';renderLeads();});byId('clearFiltersBtn')?.addEventListener('click',resetFilters);byId('searchClearBtn')?.addEventListener('click',resetFilters);
	byId('leadsPagination')?.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b)return;leadState.page=Number(b.dataset.page);renderLeads();});byId('previousPageBtn')?.addEventListener('click',()=>{leadState.page=Math.max(1,leadState.page-1);renderLeads();});byId('nextPageBtn')?.addEventListener('click',()=>{leadState.page++;renderLeads();});
	$$('.view-switch-btn').forEach(b=>b.addEventListener('click',()=>{currentView=b.dataset.view;savePreferences({view:currentView});updateView();}));
	$$('.followup-tab').forEach(tab=>tab.addEventListener('click',()=>{followupFilter=tab.dataset.followupFilter||'all';$$('.followup-tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');renderFollowupsPage();}));
	E.role?.addEventListener('change',()=>{currentRole=E.role.value==='Sales Executive'?'Sales Executive':'Manager';savePreferences({role:currentRole});renderAll();});
	byId('themeToggleBtn')?.addEventListener('click',()=>setTheme(document.body.classList.contains('dark-mode')?'light':'dark'));byId('settingsThemeSelector')?.addEventListener('change',e=>setTheme(e.target.value));byId('defaultLeadViewSelector')?.addEventListener('change',e=>{currentView=e.target.value;savePreferences({view:currentView});updateView();});
	byId('notificationBtn')?.addEventListener('click',e=>{e.stopPropagation();E.notificationPanel.hidden=!E.notificationPanel.hidden;E.notificationPanel.classList.toggle('active',!E.notificationPanel.hidden);});byId('markNotificationsReadBtn')?.addEventListener('click',()=>{saveReadNotifications(visibleFollowups().map(f=>f.id));renderNotifications();});
	byId('mobileMenuBtn')?.addEventListener('click',()=>{byId('sidebar')?.classList.add('mobile-open');byId('sidebarOverlay')?.classList.add('active');});byId('sidebarCloseBtn')?.addEventListener('click',closeSidebar);byId('sidebarOverlay')?.addEventListener('click',closeSidebar);
	byId('exportCsvMainBtn')?.addEventListener('click',()=>exportCSV(false));byId('exportLeadsBtn')?.addEventListener('click',()=>exportCSV(true));E.file?.addEventListener('change',e=>readCSV(e.target.files[0]));byId('importCsvBtn')?.addEventListener('click',doImport);
	byId('resetData')?.addEventListener('click',async()=>{if(!roleIsManager()){showToast('Only Manager can reset data.','warning');return;}if(await confirmAction('Delete all leads, follow-ups and activity data?','Reset CRM Data')){resetDatabase();preferences=getPreferences();currentRole='Manager';currentLeadId=null;currentFollowupId=null;showToast('CRM data reset successfully.','success');renderAll();}});
	document.addEventListener('dragstart',e=>{const card=e.target.closest('.kanban-card');if(card){e.dataTransfer.setData('text/plain',card.dataset.leadId);card.classList.add('dragging');}});document.addEventListener('dragend',e=>e.target.closest('.kanban-card')?.classList.remove('dragging'));document.addEventListener('dragover',e=>{if(e.target.closest('.kanban-drop-zone'))e.preventDefault();});document.addEventListener('drop',e=>{const zone=e.target.closest('.kanban-drop-zone');if(!zone)return;e.preventDefault();const lead=getLeadById(e.dataTransfer.getData('text/plain'));if(!lead||!canEditLead(lead))return showToast('You cannot move this lead.','warning');if(changeLeadStatus(lead.id,zone.dataset.status)){showToast(`Lead moved to ${zone.dataset.status}.`,'success');renderAll();}});
	document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllModals();});renderAll();navigate(location.hash.replace('#','')||'dashboard');};
const closeSidebar=()=>{byId('sidebar')?.classList.remove('mobile-open','open');byId('sidebarOverlay')?.classList.remove('active');};
const exportCSV=filtered=>{if(!roleIsManager()){showToast('Only Manager can export data.','warning');return;}const leads=filtered?visibleLeads():getLeads();if(!leads.length){showToast('There are no leads to export.','warning');return;}downloadFile(`mini-crm-${todayISO()}.csv`,objectToCSV(leads,getCSVColumns()),'text/csv;charset=utf-8;');showToast('CSV exported successfully.','success');};
const readCSV=file=>{if(!file)return;if(!file.name.toLowerCase().endsWith('.csv')){showToast('Please select a CSV file.','error');return;}const reader=new FileReader();reader.onload=e=>{try{pendingCSVRows=parseCSV(e.target.result);if(!pendingCSVRows.length)throw new Error('empty');const selected=byId('selectedCsvFile');if(selected){selected.hidden=false;selected.textContent=`${file.name} — ${pendingCSVRows.length} rows ready`; }byId('importCsvBtn')&&(byId('importCsvBtn').disabled=false);showToast('CSV loaded. Click Import CSV.','info');}catch(error){showToast('Invalid or empty CSV file.','error');}};reader.readAsText(file);};
const doImport=()=>{if(!pendingCSVRows||!roleIsManager()){showToast('Only Manager can import data.','warning');return;}const result=importLeads(pendingCSVRows);localStorage.setItem('miniCRM_lastImport',JSON.stringify(result));const box=byId('importResults');if(box)box.hidden=false;text('importResultSummary',`${result.imported} imported, ${result.invalid} invalid`);const invalid=byId('invalidRowsContainer');if(invalid)invalid.innerHTML=result.invalidRows?.length?result.invalidRows.map(x=>`<div>Row ${x.row}: ${escapeHTML(Object.values(x.errors).join(' '))}</div>`).join(''):'<p>No invalid rows.</p>';pendingCSVRows=null;if(E.file)E.file.value='';byId('importCsvBtn')&&(byId('importCsvBtn').disabled=true);showToast('CSV import completed.','success');renderAll();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
