window.__calls=[];window.__user=null;window.__profile={id:'owner-1',username:'alex'};window.__projects=[];window.__rev=0;window.__doc=null;window.__role='owner';window.__people=[{user_id:'owner-1',username:'alex',role:'owner',last_seen:new Date().toISOString()}];window.__members=[];window.__links=[];window.__copied='';window.__deleted=false;window.__authEvent=null;window.__failSave=false;
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>window.__copied=v}});
window.supabase={createClient(){return{
 auth:{getUser:async()=>({data:{user:__user}}),onAuthStateChange:cb=>{__authEvent=cb;return{data:{subscription:{unsubscribe(){}}}}},
 signInWithPassword:async args=>{__calls.push(['login',args.email]);if(args.password==='wrongpass')return{error:{message:'Invalid login credentials'}};__user={id:__profile.id,email:args.email};__authEvent?.('SIGNED_IN',{user:__user});return{data:{user:__user,session:{user:__user}}}},
 signUp:async args=>{__calls.push(['signup',args.options.data.username]);__profile={id:'member-2',username:args.options.data.username};__user={id:'member-2',email:args.email};__people.push({user_id:'member-2',username:__profile.username,role:'editor',last_seen:new Date().toISOString()});__role='editor';return{data:{user:__user,session:{user:__user}}}},
 updateUser:async args=>{__calls.push(['password',args.password]);return{data:{user:__user}}},signOut:async()=>{__user=null;__authEvent?.('SIGNED_OUT',null);return{error:null}}},
 rpc:async(name,args)=>{__calls.push([name,args]);let data=null;const fail=message=>({error:{message}});
 switch(name){case'portlov_username_available':data=args.p_username!=='taken';break;case'portlov_my_profile':data=__profile;break;case'portlov_rename':if(args.p_username==='taken')return fail('username_taken');__profile.username=args.p_username;__people.forEach(p=>{if(p.user_id===__profile.id)p.username=args.p_username});data={...__profile};break;
 case'portlov_my_projects':data=__projects;break;case'portlov_create_project':__projects=[{id:'project-1',title:args.p_title,role:'owner'}];data='project-1';break;
 case'portlov_snapshot':if(__deleted)return fail('access_denied');data={project_id:'project-1',owner_id:'owner-1',role:__user?__role:'viewer',revision:__rev,has_document:!!__doc,data:args.p_include_data?__doc:null,participants:__people,guest_count:__user?0:1};break;
 case'portlov_save':if(__failSave||args.p_revision!==__rev)return fail('revision_conflict');__rev++;__doc=args.p_data;data=__rev;break;
 case'portlov_invite':__links.push({token:args.p_token,permission:args.p_permission,active:true});break;case'portlov_join':data='project-1';break;
 case'portlov_access_list':data={members:__members,links:__links};break;case'portlov_set_access':__members.forEach(m=>{if(m.user_id===args.p_user_id){m.permission=args.p_permission;m.revoked=args.p_permission==='none'}});break;case'portlov_revoke_link':__links.forEach(l=>{if(l.token===args.p_token)l.active=false});break;
 case'portlov_delete_project':__deleted=true;__projects=[];break;default:return fail('Unknown RPC '+name)}return{data,error:null};}
}}};
