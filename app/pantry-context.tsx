'use client';
import {createContext,useContext} from 'react';
import type {PantryItem,PantryDraft,BarcodeCandidate} from '../lib/pantry';
export type PantryActions={items:PantryItem[];save:(draft:PantryDraft)=>Promise<PantryItem>;archive:(id:string,archived:boolean)=>Promise<void>;lookup:(barcode:string)=>Promise<BarcodeCandidate>};
export const PantryContext=createContext<PantryActions|null>(null);
export function usePantry(){const pantry=useContext(PantryContext);if(!pantry)throw new Error('Pantry provider is missing');return pantry}
