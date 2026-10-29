import { describe, it, expect } from 'vitest';
import { PROFILE_AVATARS } from '../data/wardrobe';
import { getAvatarDirection } from './avatarDirection';
const avatar = (slug: string) => PROFILE_AVATARS.find(item => item.id === `avatar-zodiac-${slug}`)!;

describe('头像看向鼠标', () => {
  it('灵蛇每一行都选朝向正确的列，上下不改变', () => {
    for(let row=0;row<5;row++) for(let col=0;col<5;col++) {
      expect(getAvatarDirection((col+.5)/5,(row+.5)/5,avatar('snake'))).toEqual({column:4-col,row});
    }
  });
  it('逐风马只修正抬头两行，平视与低头保持原顺序', () => {
    for(let row=0;row<5;row++) for(let col=0;col<5;col++) {
      expect(getAvatarDirection((col+.5)/5,(row+.5)/5,avatar('horse'))).toEqual({column:row<2?4-col:col,row});
    }
  });
  it('其他22个头像、新版素材及中立帧保持正常映射', () => {
    for(const item of PROFILE_AVATARS.filter(a=>!['avatar-zodiac-snake','avatar-zodiac-horse'].includes(a.id))) {
      expect(getAvatarDirection(.1,.1,item)).toEqual({column:0,row:0});
      expect(getAvatarDirection(.9,.9,item)).toEqual({column:4,row:4});
    }
    expect(getAvatarDirection(.1,.1,{...avatar('snake'),version:3})).toEqual({column:0,row:0});
    for(const item of PROFILE_AVATARS) expect(getAvatarDirection(.5,.5,item)).toEqual({column:2,row:2});
  });
  it('边界与异常指针不会选到图集以外', () => {
    expect(getAvatarDirection(-1,2)).toEqual({column:0,row:4});
    expect(getAvatarDirection(1,1)).toEqual({column:4,row:4});
    expect(getAvatarDirection(NaN,NaN)).toEqual({column:2,row:2});
  });
});
