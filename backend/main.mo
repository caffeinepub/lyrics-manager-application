import MixinStorage "blob-storage/Mixin";
import Map "mo:core/Map";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Runtime "mo:core/Runtime";
import Migration "migration";
import Storage "blob-storage/Storage";

// Apply migration on upgrade
(with migration = Migration.run)
actor {
  include MixinStorage();

  //------------------------------------------
  // Types
  //------------------------------------------

  type ColorRange = {
    start : Nat;
    end : Nat;
    color : Text;
  };

  type Song = {
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

  // Persistent file handle wrappers - now only holding references not raw handles
  type FileHandleReference = {
    path : Text;
    isSetList : Bool;
  };

  //------------------------------------------
  // Persistent State
  //------------------------------------------

  let songs = Map.empty<Text, Song>();
  let setLists = Map.empty<Text, SetList>();
  let titleToId = Map.empty<Text, Text>();
  let setListSongPositions = Map.empty<Text, List.List<SetListSongPosition>>();
  let fileHandles = Map.empty<Text, FileHandleReference>();

  //------------------------------------------
  // Helper Functions
  //------------------------------------------

  func generateId() : Text {
    let now = Time.now();
    let randomPart = Int.abs((now * 100_000_000) % 100_000_000);
    let randomString = if (randomPart % 10 == 0) {
      randomPart.toText() # "a";
    } else if (randomPart % 11 == 0) {
      randomPart.toText() # "b";
    } else if (randomPart % 12 == 0) {
      randomPart.toText() # "c";
    } else if (randomPart % 13 == 0) {
      randomPart.toText() # "d";
    } else if (randomPart % 14 == 0) {
      randomPart.toText() # "e";
    } else if (randomPart % 15 == 0) {
      randomPart.toText() # "f";
    } else if (randomPart % 16 == 0) {
      randomPart.toText() # "g";
    } else if (randomPart % 17 == 0) {
      randomPart.toText() # "h";
    } else if (randomPart % 18 == 0) {
      randomPart.toText() # "i";
    } else if (randomPart % 19 == 0) {
      randomPart.toText() # "j";
    } else if (randomPart % 30 == 0) {
      randomPart.toText() # "k";
    } else {
      randomPart.toText();
    };
    let timestampPart = now.toText();
    timestampPart # randomString;
  };

  func normalizeTitle(title : Text) : Text {
    title.toLower().trim(#char(' '));
  };

  func addSongToSetListPositions(setListId : Text, songId : Text) {
    let existingPositions = switch (setListSongPositions.get(setListId)) {
      case (null) { List.empty<SetListSongPosition>() };
      case (?positions) { positions };
    };

    let position = existingPositions.size() + 1;
    existingPositions.add({ songId; position });
    setListSongPositions.add(setListId, existingPositions);
  };

  func removeSongFromSetListPositions(setListId : Text, songId : Text) {
    switch (setListSongPositions.get(setListId)) {
      case (null) {};
      case (?positions) {
        let updatedPositions = positions.filter(
          func(pos) { pos.songId != songId }
        );
        setListSongPositions.add(setListId, updatedPositions);
      };
    };
  };

  func updateSongPositionInSetList(setListId : Text, songId : Text, newPosition : Nat) {
    switch (setListSongPositions.get(setListId)) {
      case (null) {};
      case (?positions) {
        let updatedPositions = positions.map<SetListSongPosition, SetListSongPosition>(
          func(pos) {
            if (pos.songId == songId) { { pos with position = newPosition } } else { pos };
          }
        );
        setListSongPositions.add(setListId, updatedPositions);
      };
    };
  };

  func reorderSetList(setListId : Text) {
    switch (setListSongPositions.get(setListId)) {
      case (null) {};
      case (?positions) {
        let positionsArray = positions.toArray();
        let positionsWithIndexes = positionsArray.enumerate().map(
          func((i, pos)) {
            { pos with position = i + 1 };
          }
        );
        let updatedPositions = List.empty<SetListSongPosition>();
        for (p in positionsWithIndexes) { updatedPositions.add(p) };
        setListSongPositions.add(setListId, updatedPositions);
      };
    };
  };

  //------------------------------------------
  // Persistent File Handle Management (References Only)
  //------------------------------------------

  public shared ({ caller }) func saveFileHandleReference(id : Text, path : Text, isSetList : Bool) : async () {
    let handleRef : FileHandleReference = {
      path;
      isSetList;
    };
    fileHandles.add(id, handleRef);
  };

  public query ({ caller }) func getFileHandleReference(id : Text) : async ?FileHandleReference {
    fileHandles.get(id);
  };

  //------------------------------------------
  // Song Management
  //------------------------------------------

  public type SaveSongResponse = {
    success : Bool;
    songId : ?Text;
    errorMessage : ?Text;
    replaceExistingPrompt : Bool;
  };

  public shared ({ caller }) func saveSong(
    id : ?Text,
    title : Text,
    artist : Text,
    lyrics : Text,
    scrollSpeed : Nat,
    tempo : Nat,
    backgroundColor : Text,
    textColor : Text,
    textSize : Nat,
    isBold : Bool,
    linesPerScroll : Int,
    colorRanges : [ColorRange],
    replaceExisting : Bool,
    image : ?Storage.ExternalBlob,
  ) : async SaveSongResponse {
    let now = Time.now();
    let normalizedTitle = normalizeTitle(title);
    let existingId = titleToId.get(normalizedTitle);

    switch (id, existingId) {
      case (null, ?existingSongId) {
        if (replaceExisting) {
          let updatedSong : Song = {
            id = existingSongId;
            title;
            artist;
            lyrics;
            scrollSpeed;
            tempo;
            backgroundColor;
            textColor;
            textSize;
            isBold;
            createdAt = now;
            updatedAt = now;
            linesPerScroll;
            colorRanges;
            image;
          };
          songs.add(existingSongId, updatedSong);
          titleToId.add(normalizedTitle, existingSongId);
          {
            success = true;
            songId = ?existingSongId;
            errorMessage = null;
            replaceExistingPrompt = false;
          };
        } else {
          let newId = generateId();
          let newSong : Song = {
            id = newId;
            title;
            artist;
            lyrics;
            scrollSpeed;
            tempo;
            backgroundColor;
            textColor;
            textSize;
            isBold;
            createdAt = now;
            updatedAt = now;
            linesPerScroll;
            colorRanges;
            image;
          };
          songs.add(newId, newSong);
          titleToId.add(normalizedTitle, newId);

          {
            success = true;
            songId = ?newId;
            errorMessage = null;
            replaceExistingPrompt = false;
          };
        };
      };
      case (?songId, _) {
        let createdAt = switch (songs.get(songId)) {
          case (null) { now };
          case (?existingSong) { existingSong.createdAt };
        };

        let updatedSong : Song = {
          id = songId;
          title;
          artist;
          lyrics;
          scrollSpeed;
          tempo;
          backgroundColor;
          textColor;
          textSize;
          isBold;
          createdAt;
          updatedAt = now;
          linesPerScroll;
          colorRanges;
          image;
        };

        songs.add(songId, updatedSong);
        titleToId.add(normalizedTitle, songId);

        {
          success = true;
          songId = ?songId;
          errorMessage = null;
          replaceExistingPrompt = false;
        };
      };
      case (null, null) {
        let newId = generateId();
        let newSong : Song = {
          id = newId;
          title;
          artist;
          lyrics;
          scrollSpeed;
          tempo;
          backgroundColor;
          textColor;
          textSize;
          isBold;
          createdAt = now;
          updatedAt = now;
          linesPerScroll;
          colorRanges;
          image;
        };
        songs.add(newId, newSong);
        titleToId.add(normalizedTitle, newId);

        {
          success = true;
          songId = ?newId;
          errorMessage = null;
          replaceExistingPrompt = false;
        };
      };
    };
  };

  public shared ({ caller }) func deleteSong(id : Text) : async () {
    switch (songs.get(id)) {
      case (null) { Runtime.trap("Song not found") };
      case (?song) {
        let normalizedTitle = normalizeTitle(song.title);
        if (switch (titleToId.get(normalizedTitle)) { case (?existingId) { existingId == id }; case (null) { false } }) {
          titleToId.remove(normalizedTitle);
        };
        songs.remove(id);
        for ((setListId, _) in setLists.entries()) {
          removeSongFromSetListPositions(setListId, id);
        };
      };
    };
  };

  public query ({ caller }) func getSong(id : Text) : async Song {
    switch (songs.get(id)) {
      case (null) { Runtime.trap("Song not found") };
      case (?song) { song };
    };
  };

  public query ({ caller }) func getAllSongs() : async [Song] {
    let songsArray = songs.values().toArray();
    songsArray.sort(
      func(a, b) {
        Text.compare(a.title, b.title);
      }
    );
  };

  //------------------------------------------
  // Set List Management
  //------------------------------------------

  public shared ({ caller }) func createSetList(name : Text, songIds : [Text]) : async Text {
    let id = generateId();
    let now = Time.now();
    let setList : SetList = {
      id;
      name;
      songIds;
      createdAt = now;
      updatedAt = now;
    };
    setLists.add(id, setList);
    id;
  };

  public shared ({ caller }) func updateSetList(id : Text, name : Text, songIds : [Text]) : async () {
    switch (setLists.get(id)) {
      case (null) { Runtime.trap("Set list not found") };
      case (?existingSetList) {
        let updatedSetList : SetList = {
          id;
          name;
          songIds;
          createdAt = existingSetList.createdAt;
          updatedAt = Time.now();
        };
        setLists.add(id, updatedSetList);
      };
    };
  };

  public shared ({ caller }) func deleteSetList(id : Text) : async () {
    if (not setLists.containsKey(id)) {
      Runtime.trap("Set list not found");
    };
    setLists.remove(id);
    setListSongPositions.remove(id);
  };

  public query ({ caller }) func getSongsInSetList(setListId : Text) : async [Song] {
    switch (setLists.get(setListId)) {
      case (null) { Runtime.trap("Set list not found") };
      case (?setList) {
        let songsList = List.empty<Song>();
        for (songId in setList.songIds.values()) {
          switch (songs.get(songId)) {
            case (?song) { songsList.add(song) };
            case (null) {};
          };
        };
        songsList.toArray();
      };
    };
  };

  public shared ({ caller }) func moveSongInSetList(setListId : Text, songId : Text, newPosition : Nat) : async () {
    let setList = switch (setLists.get(setListId)) {
      case (null) { Runtime.trap("Set list not found") };
      case (?setList) { setList };
    };

    if (setList.songIds.findIndex(func(id) { id == songId }) == null) {
      Runtime.trap("Song not found in set list");
    };

    updateSongPositionInSetList(setListId, songId, newPosition);
    reorderSetList(setListId);
  };

  //------------------------------------------
  // Utility Queries
  //------------------------------------------

  public query ({ caller }) func isTitleUnique(title : Text) : async Bool {
    let normalizedTitle = normalizeTitle(title);
    not titleToId.containsKey(normalizedTitle);
  };

  public query ({ caller }) func exportData() : async {
    songs : [Song];
    setLists : [SetList];
  } {
    {
      songs = songs.values().toArray();
      setLists = setLists.values().toArray();
    };
  };

  public shared ({ caller }) func importData(data : { songs : [Song]; setLists : [SetList] }) : async () {
    songs.clear();
    setLists.clear();
    titleToId.clear();
    setListSongPositions.clear();

    for (song in data.songs.values()) {
      songs.add(song.id, song);
      let normalizedTitle = normalizeTitle(song.title);
      titleToId.add(normalizedTitle, song.id);
    };

    for (setList in data.setLists.values()) {
      setLists.add(setList.id, setList);
      let positions = List.empty<SetListSongPosition>();
      var i = 0;
      while (i < setList.songIds.size()) {
        positions.add({ songId = setList.songIds[i]; position = i + 1 });
        i += 1;
      };
      setListSongPositions.add(setList.id, positions);
    };
  };

  public query ({ caller }) func getSetListSongInfo(setListId : Text) : async {
    setList : SetList;
    songPositions : [SetListSongPosition];
  } {
    switch (setLists.get(setListId)) {
      case (null) { Runtime.trap("Set list not found") };
      case (?setList) {
        let positions = switch (setListSongPositions.get(setListId)) {
          case (null) { List.empty<SetListSongPosition>() };
          case (?pos) { pos };
        };
        {
          setList;
          songPositions = positions.toArray();
        };
      };
    };
  };

  public query ({ caller }) func getSetListSongCount(setListId : Text) : async Nat {
    switch (setLists.get(setListId)) {
      case (null) { Runtime.trap("Set list not found") };
      case (?setList) {
        setList.songIds.size();
      };
    };
  };
};
