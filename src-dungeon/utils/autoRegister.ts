// 智子试炼场自动身份识别：复用桌面端「班级绑定」已收集的信息，
// 学生绑过班级码即可直接进入地牢，无需重复填写昵称/姓名/手机号。
//
// 桌面端绑定班级码时已存入以下 localStorage（见 SettingsPage.handleBind）：
//   csp_class_code      班级码
//   csp_display_name    昵称（排行榜显示）
//   csp_student_name    真实姓名
//   csp_student_phone   手机号
//   csp_class_info      { class_code, label, teacher_name }
//
// 地牢后端 /api/dungeon/register 需要：class_code / display_name / real_name / phone / school
// 其中 school（修行流派）桌面未收集，首次进入时让学生选一次（见 SchoolPickerScreen）。

import type { School } from '../types/dungeon';
import type { PlayerState } from '../types/dungeon';

export interface DesktopBindingInfo {
  classCode: string;
  displayName: string;
  realName: string;
  phone: string;
}

/** 读取桌面端绑定信息。classCode 为空表示未绑定，地牢不可用。 */
export function readDesktopBinding(): DesktopBindingInfo | null {
  try {
    const classCode = localStorage.getItem('csp_class_code') || '';
    if (!classCode) return null;
    return {
      classCode,
      displayName: localStorage.getItem('csp_display_name') || '',
      realName: localStorage.getItem('csp_student_name') || '',
      phone: localStorage.getItem('csp_student_phone') || '',
    };
  } catch {
    return null;
  }
}

/** 桌面绑定信息是否完整（地牢后端建档所需四项齐全）。 */
export function isBindingComplete(info: DesktopBindingInfo | null): boolean {
  if (!info) return false;
  return !!(info.classCode && info.displayName && info.realName && info.phone);
}

/**
 * 用桌面绑定信息 + 学生选的流派，组装地牢 PlayerState 的初始身份字段。
 * 调用方拿到后传给 dungeonStore.initPlayer，再调 registerPlayer 建档。
 */
export function buildPlayerIdentity(info: DesktopBindingInfo, school: School): Pick<PlayerState,
  'classCode' | 'displayName' | 'realName' | 'phone' | 'school'> {
  return {
    classCode: info.classCode,
    displayName: info.displayName,
    realName: info.realName,
    phone: info.phone,
    school,
  };
}
