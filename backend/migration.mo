import Map "mo:core/Map";
import Storage "blob-storage/Storage";
import List "mo:core/List";

module {
  type ColorRange = {
    start : Nat;
    end : Nat;
    color : Text;
  };

  type OldSong = {
    id : Text;
    title : Text;
    artist : Text;
    lyrics : Text;
    scrollSpeed : Nat;
    tempo : Nat;
    backgroundColor : Text;
    textColor : Text;
    textSize : Nat;
    isBold : Bool;
    createdAt : Int;
    updatedAt : Int;
    linesPerScroll : Int;
    colorRanges : [ColorRange];
  };

  type NewSong = {
    id : Text;
    title : Text;
    artist : Text;
    lyrics : Text;
    scrollSpeed : Nat;
    tempo : Nat;
    backgroundColor : Text;
    textColor : Text;
    textSize : Nat;
    isBold : Bool;
    createdAt : Int;
    updatedAt : Int;
    linesPerScroll : Int;
    colorRanges : [ColorRange];
    image : ?Storage.ExternalBlob;
  };

  type SetList = {
    id : Text;
    name : Text;
    songIds : [Text];
    createdAt : Int;
    updatedAt : Int;
  };

  type SetListSongPosition = {
    songId : Text;
    position : Nat;
  };

  type FileHandleReference = {
    path : Text;
    isSetList : Bool;
  };

  type OldActor = {
    songs : Map.Map<Text, OldSong>;
    setLists : Map.Map<Text, SetList>;
    titleToId : Map.Map<Text, Text>;
    setListSongPositions : Map.Map<Text, List.List<SetListSongPosition>>;
    fileHandles : Map.Map<Text, FileHandleReference>;
  };

  type NewActor = {
    songs : Map.Map<Text, NewSong>;
    setLists : Map.Map<Text, SetList>;
    titleToId : Map.Map<Text, Text>;
    setListSongPositions : Map.Map<Text, List.List<SetListSongPosition>>;
    fileHandles : Map.Map<Text, FileHandleReference>;
  };

  public func run(old : OldActor) : NewActor {
    let newSongs = old.songs.map<Text, OldSong, NewSong>(
      func(_id, oldSong) {
        { oldSong with image = null };
      }
    );
    { old with songs = newSongs };
  };
};
