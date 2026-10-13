import React, { useEffect, useState } from "react";

import { addToast, Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";

import { t } from "@/common/i18n";
import { createRelationTag, type RelationTag, updateRelationTag } from "@/service/relation-tag";

interface Props {
  isOpen: boolean;
  onOpenChange: () => void;
  onClose: () => void;
  mode: "create" | "rename";
  tag: RelationTag | null;
  onSuccess: () => void;
}

const GroupModal = ({ isOpen, onOpenChange, onClose, mode, tag, onSuccess }: Props) => {
  const [tagNameInput, setTagNameInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (mode === "create") {
        setTagNameInput("");
      } else if (mode === "rename" && tag) {
        setTagNameInput(tag.name);
      }
    }
  }, [isOpen, mode, tag]);

  const handleSaveTag = async () => {
    if (!tagNameInput.trim()) {
      addToast({ title: t("请输入分组名称"), color: "danger" });
      return;
    }

    try {
      setLoading(true);
      if (mode === "create") {
        const res = await createRelationTag({ tag: tagNameInput.trim() });
        if (res.code === 0) {
          addToast({ title: t("创建分组成功"), color: "success" });
          setTagNameInput("");
          onClose();
          onSuccess();
        } else {
          addToast({ title: res.message || t("创建分组失败"), color: "danger" });
        }
      } else if (mode === "rename" && tag) {
        const res = await updateRelationTag({ tagid: tag.tagid, name: tagNameInput.trim() });
        if (res.code === 0) {
          addToast({ title: t("修改分组名称成功"), color: "success" });
          setTagNameInput("");
          onClose();
          onSuccess();
        } else {
          addToast({ title: res.message || t("修改分组名称失败"), color: "danger" });
        }
      }
    } catch {
      addToast({ title: mode === "create" ? t("创建分组失败") : t("修改分组名称失败"), color: "danger" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal radius="md" disableAnimation isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        {onClose => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {mode === "create" ? t("创建分组") : t("修改分组名称")}
            </ModalHeader>
            <ModalBody>
              <Input placeholder={t("请输入分组名称")} value={tagNameInput} onValueChange={setTagNameInput} />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {t("取消")}
              </Button>
              <Button color="primary" onPress={handleSaveTag} isLoading={loading}>
                {mode === "create" ? t("创建") : t("保存")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default GroupModal;
