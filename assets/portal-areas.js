// Shared by the portal and the authenticated work screen.
const areaSections = {
 personnel: ['Personal',[['stamm','Personalverwaltung','admin'],['eigene','Meine Abwesenheiten','staff'],['team','Teamkalender','staff'],['freigaben','Freigaben & Vertretungen','approveStaff']]],
 members: ['Mitglieder',[['profil','Mein Profil','profile'],['mitgliederverwaltung','Mitgliederverwaltung','manageMembers']]],
 building: ['Gebäude', [
  ['pflege','Gebäudepflege'], ['technik','Haustechnik'], ['wartung','Wartung','viewMaintenance'],
  ['raeume','Räume & QR-Codes'], ['inventar','Inventar & Lager'], ['ausleihe','Ausleihe','admin'],
  ['maengel','Gebäudemängel'], ['grundrisse','Grundrisse']
 ]],
 administration: ['Verwaltung', [
  ['kalender','Kalender','viewCalendar'], ['benutzer','Benutzer & Rechte','manageUsers'],
  ['arbeitszeit','Zeiterfassung','personal'], ['system','Systemstatus','admin'], ['daten','Datensicherung','admin']
 ]],
 events: ['Veranstaltungen', [
  ['wochenplan','Wochenplan als PDF','manageCalendar'], ['termine','Terminplanung & Abnahmen','manageCalendar'], ['vereinbarungen','Vereinbarungsvorlagen','admin']
 ]],
 kitchen: ['Küche', [
  ['kuechenpflege','Reinigung','manageCalendar'], ['kuechendienst','Küchendienste','manageCalendar'],
  ['kuechenordnung','Kontakte, Bestand & Regeln','manageCalendar'], ['kuechengeraete','Geräte & Anleitungen','kitchenMaintenance']
 ]],
 finance: ['Finanzen', [
  ['auslagen','Auslage einreichen','planned'], ['kontodaten','Kontodaten','planned'], ['spenden','Spenden','planned']
 ]]
};
function sectionAllowed(right,user) {
 if(right==='staff'||right==='approveStaff'){
  const keys=right==='staff'?['staffPastoral','staffBuilding','approvePastoral','approveBuilding']:['approvePastoral','approveBuilding'];
  return user.role==='admin'||keys.some(key=>user.permissions?.[key]===true);
 }
 if(right==='profile')return true;
 if(right==='manageMembers')return user.role==='admin'||user.permissions?.manageMembers===true;
 if(user.role==='member')return false;
 if(user.role==='admin')return true;
 if(right==='planned')return user.permissions?.viewFinance===true;
 if(right==='admin')return false;
 if(right==='viewCalendar')return user.permissions?.viewCalendar || sectionAllowed('manageCalendar',user);
 if(right==='personal')return user.role!=='technician';
 if(right==='kitchenMaintenance')return sectionAllowed('manageCalendar',user)&&sectionAllowed('viewMaintenance',user);
 if(right && user.role==='technician')return right==='viewMaintenance';
 if(right)return user.permissions?.[right] ?? (right==='manageCalendar' && user.role==='coordinator');
 return ['elder','deacon','coordinator','technician','cleaner','backup','volunteer'].includes(user.role)||user.permissions?.manageRooms===true;
}
