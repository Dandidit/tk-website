import { getCurrentUser, getJWT } from "./auth.js";
const bell=document.querySelector("[data-onboarding-reminder]");
if(bell){(async()=>{try{const user=await getCurrentUser();if(!user)return;const token=await getJWT();const r=await fetch("/api/onboarding",{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});if(!r.ok)return;const d=await r.json();if(!d.completed)bell.hidden=false;}catch(e){console.error("Onboarding reminder failed:",e);}})();}
