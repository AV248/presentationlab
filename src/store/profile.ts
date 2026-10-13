import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface MyProfile { username: string; displayName: string; bio: string; location: string; website: string; signature: string }
interface ProfileState extends MyProfile { festivalOverride: string | null; set: (p: Partial<MyProfile>) => void; setFestivalOverride: (id: string | null) => void }
export const useProfile = create<ProfileState>()(persist((set) => ({
  username: '', displayName: '', bio: '', location: '', website: '', signature: '', festivalOverride: null,
  set: (p) => set(p), setFestivalOverride: (festivalOverride) => set({ festivalOverride }),
}), { name: 'pb.profile.v1' }));
