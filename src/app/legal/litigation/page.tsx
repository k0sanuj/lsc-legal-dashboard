import { DisputeRegister } from '@/components/legal/dispute-register'

export default function LitigationPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DisputeRegister kind="LITIGATION" searchParams={props.searchParams} />
}
