import React, { useState } from "react";

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
  addToast,
} from "@heroui/react";
import { RiFileCopyLine, RiHeadphoneLine, RiLinkM, RiLogoutBoxRLine, RiPlayListAddLine } from "@remixicon/react";

import { t } from "@/common/i18n";
import { useNeteaseTogether } from "@/store/netease-together";
import { usePlayList } from "@/store/play-list";

import TogetherPair from "./together-pair";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 「一起听」面板。
 *
 * 两种形态：
 *  - 不在房间 → 创建 / 用邀请码加入；
 *  - 在房间   → 成员、邀请码、同步队列、退出。
 *
 * 没做成浮层挂在按钮上，是因为要放的东西太多（邀请码要能选中复制、成员要能看头像），
 * 挂在播放栏那种高度受限的位置上很容易出现遮挡和点不到的问题。
 */
const TogetherModal = ({ isOpen, onOpenChange }: Props) => {
  const role = useNeteaseTogether(s => s.role);
  const members = useNeteaseTogether(s => s.members);
  const invite = useNeteaseTogether(s => s.invite);
  const busy = useNeteaseTogether(s => s.busy);
  const createRoom = useNeteaseTogether(s => s.createRoom);
  const joinRoom = useNeteaseTogether(s => s.joinRoom);
  const leaveRoom = useNeteaseTogether(s => s.leaveRoom);
  const pushPlaylist = useNeteaseTogether(s => s.pushPlaylist);

  const list = usePlayList(s => s.list);
  const neteaseCount = list.filter(item => item.source === "netease" && item.neteaseId).length;

  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const inRoom = role !== "idle";

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      addToast({ title: t("复制失败，请手动选中复制"), color: "warning" });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md" radius="lg" isDismissable>
      <ModalContent>
        {onClose => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <RiHeadphoneLine size={20} />
              {t("一起听")}
            </ModalHeader>

            <ModalBody>
              {!inRoom ? (
                <div className="flex flex-col gap-5">
                  <p className="text-foreground-500 text-sm">
                    {t(
                      "和另一个人同步听同一份歌单。双方都要登录网易云账号 ——\n                    房间里的状态存在网易云服务端，只有一个人的房间读不到任何东西。",
                    )}
                  </p>

                  <Button
                    color="primary"
                    startContent={<RiHeadphoneLine size={18} />}
                    isLoading={busy}
                    onPress={() => void createRoom()}
                  >
                    {t("创建房间")}
                  </Button>

                  <div className="flex items-center gap-3">
                    <div className="bg-divider h-px flex-1" />
                    <span className="text-foreground-400 text-xs">{t("或加入对方的房间")}</span>
                    <div className="bg-divider h-px flex-1" />
                  </div>

                  <Input
                    label={t("邀请码")}
                    labelPlacement="outside"
                    placeholder={t("房间号|发起人ID")}
                    value={code}
                    onValueChange={setCode}
                    startContent={<RiLinkM size={16} className="text-foreground-400" />}
                    description={t("对方分享过来的一整句话也可以直接粘进来")}
                  />

                  <Button
                    variant="flat"
                    isDisabled={!code.trim()}
                    isLoading={busy}
                    onPress={async () => {
                      const ok = await joinRoom(code);
                      if (ok) onClose();
                    }}
                  >
                    {t("加入房间")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    {members.length >= 2 ? (
                      <TogetherPair members={members} size={30} />
                    ) : (
                      <div className="bg-content2 text-foreground-400 flex h-9 w-9 flex-none items-center justify-center rounded-full">
                        <RiHeadphoneLine size={18} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {members.length >= 2
                          ? members.map(m => m.nickname || t("神秘听众")).join(" · ")
                          : t("等待对方加入")}
                      </div>
                      <div className="text-foreground-500 text-xs">
                        {role === "host" ? t("你是房主，退出即结束房间") : t("你已加入对方的房间")}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-foreground-500 mb-1.5 text-xs">{t("邀请码（发给对方）")}</div>
                    <div className="bg-content2 rounded-medium flex items-center gap-2 p-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs select-all">{invite}</span>
                      <Tooltip closeDelay={0} content={copied ? t("已复制") : t("复制")}>
                        <Button isIconOnly size="sm" variant="light" onPress={() => void copyInvite()}>
                          <RiFileCopyLine size={16} />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>

                  <Button
                    variant="flat"
                    startContent={<RiPlayListAddLine size={18} />}
                    isDisabled={!neteaseCount}
                    onPress={() => void pushPlaylist()}
                  >
                    {neteaseCount
                      ? t("把当前 {0} 首网易云歌曲同步给房间", neteaseCount)
                      : t("当前列表里没有网易云歌曲")}
                  </Button>

                  <p className="text-foreground-400 text-xs">
                    {t("播放、暂停、切歌都会自动同步；进度按心跳对齐，偏差在 3 秒内不校正。")}
                  </p>
                </div>
              )}
            </ModalBody>

            {inRoom && (
              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  startContent={<RiLogoutBoxRLine size={18} />}
                  onPress={async () => {
                    await leaveRoom();
                    onClose();
                  }}
                >
                  {role === "host" ? t("结束房间") : t("退出房间")}
                </Button>
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default TogetherModal;
