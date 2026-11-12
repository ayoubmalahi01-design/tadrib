// Supabase Edge Function: invite a coach/admin/manager without exposing service_role.
// Deploy with: supabase functions deploy invite-user
// Configure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY as function secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' }
serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 try{
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth=req.headers.get('Authorization'); if(!auth)throw new Error('Missing authorization')
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}})
  const {data:{user},error:userError}=await caller.auth.getUser(); if(userError||!user)throw new Error('Unauthorized')
  const admin=createClient(url,service)
  const {data:actor,error:actorError}=await admin.from('profiles').select('id,role,institution_id,account_status').eq('id',user.id).single()
  if(actorError||!actor||actor.account_status!=='active')throw new Error('Active profile required')
  const body=await req.json(); const email=String(body.email||'').trim().toLowerCase(); const full_name=String(body.full_name||'').trim(); const role=String(body.role||'coach'); const institution_id=body.institution_id||actor.institution_id
  if(!email||!full_name)throw new Error('Email and full name are required')
  const isOwner=actor.role==='owner'; const isManager=actor.role==='manager'; const isAdmin=actor.role==='admin'
  if(!isOwner&&!isManager&&!isAdmin)throw new Error('Insufficient role')
  if(isOwner){if(!['manager','admin','coach'].includes(role)||!institution_id)throw new Error('Owner must select an institution and valid role')}
  else {if(institution_id!==actor.institution_id||!['coach','admin'].includes(role)||(role==='admin'&&!isManager))throw new Error('You cannot invite this role or institution')}
  const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{full_name}})
  if(inviteError)throw inviteError
  if(!invited.user)throw new Error('Invitation did not create a user')
  const {error:profileError}=await admin.from('profiles').update({institution_id,role,account_status:isOwner&&role==='manager'?'active':'pending',full_name,email,created_by:user.id,approved_by:isOwner&&role==='manager'?user.id:null,approved_at:isOwner&&role==='manager'?new Date().toISOString():null}).eq('id',invited.user.id)
  if(profileError)throw profileError
  return new Response(JSON.stringify({ok:true,user_id:invited.user.id}),{headers:{...cors,'Content-Type':'application/json'}})
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Unexpected error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}
})
