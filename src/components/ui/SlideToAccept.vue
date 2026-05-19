<script setup>
import { ref } from "vue";

const emit = defineEmits([
  "confirm"
]);

const dragging = ref(false);

const sliderX = ref(0);

const completed = ref(false);

let startX = 0;

const startDrag = (e) => {

  if (completed.value) return;

  dragging.value = true;

  startX =
    e.type.includes("mouse")
      ? e.clientX
      : e.touches[0].clientX;
};

const onDrag = (e) => {

  if (!dragging.value) return;

  const clientX =
    e.type.includes("mouse")
      ? e.clientX
      : e.touches[0].clientX;

  let move = clientX - startX;

  if (move < 0) move = 0;

  if (move > 220) move = 220;

  sliderX.value = move;

  if (move >= 220) {

    completed.value = true;

    dragging.value = false;

    emit("confirm");
  }
};

const stopDrag = () => {

  if (!completed.value) {

    sliderX.value = 0;
  }

  dragging.value = false;
};
</script>

<template>
  <div
    class="
      w-full
      h-16
      bg-zinc-200
      rounded-full
      relative
      overflow-hidden
      select-none
    "
  >

    <!-- TEXT -->
    <div
      class="
        absolute
        inset-0
        flex
        items-center
        justify-center
        text-zinc-500
        font-semibold
      "
    >
      {{
        completed
          ? 'Aceptado'
          : 'Desliza para aceptar'
      }}
    </div>

    <!-- SLIDER -->
    <div
      @mousedown="startDrag"
      @touchstart="startDrag"

      @mousemove="onDrag"
      @touchmove="onDrag"

      @mouseup="stopDrag"
      @mouseleave="stopDrag"
      @touchend="stopDrag"

      :style="{
        transform:
          `translateX(${sliderX}px)`
      }"

      class="
        absolute
        top-1
        left-1
        w-14
        h-14
        bg-green-500
        rounded-full
        shadow-xl
        flex
        items-center
        justify-center
        text-white
        text-2xl
        cursor-pointer
        transition
      "
    >
      →
    </div>

  </div>
</template>