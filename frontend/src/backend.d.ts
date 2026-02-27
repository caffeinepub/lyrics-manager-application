import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export class ExternalBlob {
    getBytes(): Promise<Uint8Array<ArrayBuffer>>;
    getDirectURL(): string;
    static fromURL(url: string): ExternalBlob;
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob;
    withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob;
}
export interface SetListSongPosition {
    songId: string;
    position: bigint;
}
export interface SetList {
    id: string;
    name: string;
    createdAt: bigint;
    updatedAt: bigint;
    songIds: Array<string>;
}
export interface Song {
    id: string;
    backgroundColor: string;
    tempo: bigint;
    title: string;
    lyrics: string;
    createdAt: bigint;
    textSize: bigint;
    isBold: boolean;
    colorRanges: Array<ColorRange>;
    updatedAt: bigint;
    linesPerScroll: bigint;
    artist: string;
    image?: ExternalBlob;
    scrollSpeed: bigint;
    textColor: string;
}
export interface SaveSongResponse {
    songId?: string;
    errorMessage?: string;
    success: boolean;
    replaceExistingPrompt: boolean;
}
export interface ColorRange {
    end: bigint;
    color: string;
    start: bigint;
}
export interface FileHandleReference {
    isSetList: boolean;
    path: string;
}
export interface backendInterface {
    createSetList(name: string, songIds: Array<string>): Promise<string>;
    deleteSetList(id: string): Promise<void>;
    deleteSong(id: string): Promise<void>;
    exportData(): Promise<{
        songs: Array<Song>;
        setLists: Array<SetList>;
    }>;
    getAllSongs(): Promise<Array<Song>>;
    getFileHandleReference(id: string): Promise<FileHandleReference | null>;
    getSetListSongCount(setListId: string): Promise<bigint>;
    getSetListSongInfo(setListId: string): Promise<{
        songPositions: Array<SetListSongPosition>;
        setList: SetList;
    }>;
    getSong(id: string): Promise<Song>;
    getSongsInSetList(setListId: string): Promise<Array<Song>>;
    importData(data: {
        songs: Array<Song>;
        setLists: Array<SetList>;
    }): Promise<void>;
    isTitleUnique(title: string): Promise<boolean>;
    moveSongInSetList(setListId: string, songId: string, newPosition: bigint): Promise<void>;
    saveFileHandleReference(id: string, path: string, isSetList: boolean): Promise<void>;
    saveSong(id: string | null, title: string, artist: string, lyrics: string, scrollSpeed: bigint, tempo: bigint, backgroundColor: string, textColor: string, textSize: bigint, isBold: boolean, linesPerScroll: bigint, colorRanges: Array<ColorRange>, replaceExisting: boolean, image: ExternalBlob | null): Promise<SaveSongResponse>;
    updateSetList(id: string, name: string, songIds: Array<string>): Promise<void>;
}
