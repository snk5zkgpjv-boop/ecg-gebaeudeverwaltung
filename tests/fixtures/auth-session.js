import {createSession,hashPassword} from '../../lib/auth.js';

const passwordHash=hashPassword('synthetic-fixture-password');
// Use the actual issuer so authorization tests follow the current cookie format.
export async function authSessionFixture(appUserId){
 const user={id:'fixture-'+appUserId,app_user_id:appUserId,active:true,must_change_password:false,password_hash:passwordHash};
 let header;
 await createSession({setHeader(_key,value){header=value}},async()=>[{id:'fixture-session'}],user.id,passwordHash);
 return {user,cookie:header.split(';')[0]};
}
