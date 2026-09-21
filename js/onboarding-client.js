import { getJWT, getCurrentUser } from "./auth.js";
import { upload } from "https://cdn.jsdelivr.net/npm/@vercel/blob@1.1.1/+esm";
let saveTimer;
async function headers(){const token=await getJWT();if(!token)throw new Error("Your session has expired. Please sign in again.");return {Authorization:`Bearer ${token}`,"Content-Type":"application/json"};}
export async function loadOnboarding(){const user=await getCurrentUser();if(!user){window.location.href="/login.html";return null;}const r=await fetch("/api/onboarding",{headers:await headers(),cache:"no-store"});if(!r.ok)throw new Error("Unable to load onboarding data.");return await r.json();}
export function queueSave(state){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveOnboarding(state),700);}
export async function saveOnboarding(state,action="save"){try{const r=await fetch("/api/onboarding",{method:"POST",headers:await headers(),body:JSON.stringify({...state,action})});if(!r.ok)throw new Error("Unable to save onboarding data.");return await r.json();}catch(e){console.error(e);return null;}}
export async function skipOnboarding(state){return saveOnboarding(state,"skip");}
export async function completeOnboarding(state){return saveOnboarding(state,"complete");}
export async function uploadOnboardingFile(file,itemId){const token=await getJWT();if(!token)throw new Error("Your session has expired. Please sign in again.");const ext=file.name.toLowerCase().split(".").pop();if(!["pdf","jpg","jpeg","png"].includes(ext))throw new Error("Only PDF, JPG and PNG files are allowed.");return await upload(`onboarding/${itemId}/${file.name}`,file,{access:"public",handleUploadUrl:"/api/upload",headers:{Authorization:`Bearer ${token}`},clientPayload:JSON.stringify({itemId})});}
window.TKOnboarding={loadOnboarding,queueSave,saveOnboarding,skipOnboarding,completeOnboarding,uploadOnboardingFile};
