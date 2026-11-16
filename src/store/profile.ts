import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface MyProfile { username: string; displayName: string; bio: string; location: string; website: string; signature: string }
interface ProfileState extends MyProfile { set: (p: Partial<MyProfile>) => void }
export const useProfile = create<ProfileState>()(persist((set) => ({
  username: '', displayName: '', bio: '', location: '', website: '', signature: '',
  set: (p) => set(p),
}), { name: 'pb.profile.v1', skipHydration: true }));
