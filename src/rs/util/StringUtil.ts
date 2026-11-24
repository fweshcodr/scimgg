export class StringUtil {
  // OSRS variant of djb2 starts at zero, not 5381.
  static hashDjb2(str: string) {
    let hash = 0;
    if (str.length === 0) {
      return hash;
    }
    let char: number;
    for (let i = 0; i < str.length; i++) {
      char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Preserve signed 32-bit overflow.
    }
    return hash;
  }

  static hashOld(name: string) {
    name = name.toUpperCase();
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 61 + name.charCodeAt(i) - 32) | 0;
    }
    return hash;
  }
}
